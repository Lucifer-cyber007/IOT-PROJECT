"""Groq-backed extraction of structured fields from raw OCR text.

Generalized to work from a per-machine-template field schema (see
`schemas.FieldSchema` / `models.MachineTemplate.fields`) instead of one fixed
bill schema - the prompt and post-extraction validation are both built
dynamically from whichever template matched the scanned document.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import random
import re

import httpx

logger = logging.getLogger(__name__)

GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_MODEL = "llama-3.3-70b-versatile"

# Transient conditions worth another attempt rather than failing the extraction.
RETRYABLE_HTTP_STATUSES = {408, 429, 500, 502, 503, 504}
BACKOFF_BASE_SECONDS = 0.6
# Groq's 429 body names the exact wait, e.g. "Please try again in 2.6s" or "170ms".
# Respecting that (instead of a short fixed backoff) is what actually clears a
# token-per-minute limit; a fixed 1-2s backoff just re-hits the same window.
RETRY_AFTER_RE = re.compile(r"try again in (\d+(?:\.\d+)?)(ms|s)\b", re.IGNORECASE)
MAX_RETRY_AFTER_SECONDS = 20.0

VALID_FLAGS = {"low_confidence", "not_found"}


def _retry_after_seconds(response: httpx.Response) -> float | None:
    """Extract Groq's suggested wait time from a 429, in seconds."""
    header = response.headers.get("retry-after")
    if header:
        try:
            return min(float(header), MAX_RETRY_AFTER_SECONDS)
        except ValueError:
            pass

    match = RETRY_AFTER_RE.search(response.text)
    if match:
        value = float(match.group(1))
        if match.group(2).lower() == "ms":
            value /= 1000
        return min(value, MAX_RETRY_AFTER_SECONDS)

    return None

RETRY_REMINDER = (
    "\n\nYour previous response was not valid JSON. Return JSON ONLY: start with { and end with }. "
    "No markdown code fences, no prose before or after."
)


class LlmError(RuntimeError):
    """Raised when Groq cannot be reached or is misconfigured."""


class LlmParseError(RuntimeError):
    """Raised when the model's output could not be coerced into the schema."""

    def __init__(self, message: str, raw_response: str = "") -> None:
        super().__init__(message)
        self.raw_response = raw_response


# --- Prompt building (data-driven from a MachineTemplate's field schema) ----


def build_system_prompt(fields: list[dict], prompt_instructions: str | None) -> str:
    """Build the extraction system prompt from a template's field list.

    Each field's `normalizer_type` drives a generic shape rule (digits-only,
    numeric, date), and its `synonyms` become the label variants to look for.
    `prompt_instructions` is optional free-text a template can supply for
    extraction quirks a generic rule can't express (identifier disambiguation,
    domain-specific fallbacks, bilingual labels, etc).
    """
    schema_lines = [f'  "{f["key"]}": string | null,' for f in fields]

    field_rules = []
    for f in fields:
        rule = f'"{f["key"]}" - {f["label"]}.'
        normalizer = f.get("normalizer_type", "text")
        if normalizer == "digits":
            rule += " Digits only - no letters, spaces or punctuation."
        elif normalizer == "number":
            rule += " A numeric value. Strip currency symbols and commas but keep decimals."
        elif normalizer == "date":
            rule += " Normalize the date to DD-MM-YYYY."
        synonyms = f.get("synonyms") or []
        if synonyms:
            rule += " Labels on the document may include: " + ", ".join(synonyms) + "."
        field_rules.append(rule)

    prompt = f"""You extract structured data from the raw OCR text of a scanned document.

Return ONLY a single valid JSON object. No markdown fences, no commentary, no explanation.

The object must have exactly these keys:
{{
{chr(10).join(schema_lines)}
  "confidence_flags": {{ }}
}}

GENERAL
- NEVER invent a value. If a field is genuinely not present in the OCR text, use null.
- All field values are strings or null. Numbers must be returned as strings.
- Match each value to its label by meaning, not by which line it happens to sit on - OCR
  routinely splits a label from its value, or emits them on separate or reordered lines.

FIELD RULES

{chr(10).join(field_rules)}

confidence_flags
- An object mapping field names to either "low_confidence" or "not_found".
- Include ONLY fields that need human review. Omit fields you are confident about.
- Use "not_found" for every field you set to null.
- Use "low_confidence" when you did return a best guess but the OCR text was garbled or
  ambiguous, or the label was missing and you inferred the value from position.
"""
    if prompt_instructions:
        prompt += "\n" + prompt_instructions
    return prompt


def _extract_json_object(text: str) -> dict:
    """Pull a JSON object out of a model response, tolerating fences and stray prose."""
    candidate = text.strip()

    fenced = re.search(r"```(?:json)?\s*(.*?)```", candidate, re.DOTALL)
    if fenced:
        candidate = fenced.group(1).strip()

    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError:
        start, end = candidate.find("{"), candidate.rfind("}")
        if start == -1 or end <= start:
            raise
        parsed = json.loads(candidate[start : end + 1])

    if not isinstance(parsed, dict):
        raise ValueError("Model returned JSON that is not an object.")
    return parsed


def _clean_str(value: object) -> str | None:
    """Coerce a model value to a trimmed string, mapping empty/null-ish to None."""
    if value is None or isinstance(value, (dict, list)):
        return None
    text = str(value).strip()
    if not text or text.lower() in {"null", "none", "n/a", "na", "-", "not found"}:
        return None
    return text


def _strip_trailing_separators(value: str | None) -> str | None:
    """Drop separator punctuation left on the end of a value by the layout."""
    if value is None:
        return None
    cleaned = value.rstrip(" .,;:-")
    return cleaned or None


def _validate_digit_identifier(
    value: str | None, min_length: int = 4, max_length: int = 20
) -> str | None:
    """Reject an identifier that is not a clean digit string of a plausible size.

    A model can emit garbled text, or run two adjacent identifiers together
    into one value, instead of a clean number. Better to null that out than
    show junk.
    """
    if value is None:
        return None
    if not re.fullmatch(r"\d+", value):
        return None
    return value if min_length <= len(value) <= max_length else None


def _normalize_number(value: str | None) -> str | None:
    """Extract the first clean numeric token (handles thousands separators)."""
    if value is None:
        return None
    match = re.search(r"\d[\d,]*(?:\.\d+)?", value)
    if not match:
        return None
    return match.group(0).replace(",", "")


def _normalize_date(value: str | None) -> str | None:
    """Best-effort normalization to DD-MM-YYYY; returns the input if unrecognized."""
    if value is None:
        return None

    text = value.strip()

    match = re.fullmatch(r"(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})", text)
    if match:
        day, month, year = match.groups()
        return f"{int(day):02d}-{int(month):02d}-{year}"

    match = re.fullmatch(r"(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})", text)
    if match:
        year, month, day = match.groups()
        return f"{int(day):02d}-{int(month):02d}-{year}"

    months = {
        "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
        "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
    }
    match = re.fullmatch(r"(\d{1,2})[-/\s]*([A-Za-z]{3,9})[-/\s,]*(\d{4})", text)
    if match:
        day, month_name, year = match.groups()
        month = months.get(month_name[:3].lower())
        if month:
            return f"{int(day):02d}-{month:02d}-{year}"

    return text


# --- Quirks: named special-case post-processing hooks ----------------------
#
# The generic engine (prompt + per-field normalizer_type) covers ordinary
# templates. A handful of documents need extra deterministic repair that no
# amount of prompt wording reliably fixes - today that's exactly one case,
# ported unchanged from the original single-schema bill parser: Karnataka
# electricity bills print three near-identical numeric identifiers (RR No,
# Acc Id, M.R Code) stacked together, and OCR often emits every label in one
# block and every value in another, leaving no adjacency for the model to
# align on. Templates opt into this via `quirks: ["bescom_three_identifier_repair"]`
# and must define `rr_number` / `account_number` / `mr_code` fields.

RR_TOKEN_RE = re.compile(r"\b(?=[A-Z][A-Z0-9]{5,15}\b)(?=[A-Z0-9]*\d)[A-Z0-9]+\b")

RR_LABEL = r"R\.?\s*R\.?\s*(?:No|Number)"
MR_CODE_LABEL = r"M\.?\s*R\.?\s*(?:Code|No\.?|Number)"
ACC_ID_LABEL = (
    r"(?:Acc(?:ount)?\.?\s*(?:Id|No|Number)|Consumer\s*(?:No|Number)|CA\s*No|Service\s*No)"
)


def _find_labelled_value(
    ocr_text: str, label_pattern: str, value_pattern: str, lookahead: int = 2
) -> str | None:
    """Find the value belonging to a label, on the same line or just below it."""
    lines = [line.strip() for line in ocr_text.splitlines()]
    label_re = re.compile(label_pattern, re.IGNORECASE)
    value_re = re.compile(value_pattern)

    for index, line in enumerate(lines):
        match = label_re.search(line)
        if not match:
            continue

        found = value_re.search(line[match.end() :])
        if found:
            return found.group(0)

        for offset in range(1, lookahead + 1):
            if index + offset >= len(lines):
                break
            following = lines[index + offset]
            if label_re.search(following):
                break
            found = value_re.search(following)
            if found:
                return found.group(0)

    return None


def _unique(values: list[str]) -> list[str]:
    seen: list[str] = []
    for value in values:
        if value not in seen:
            seen.append(value)
    return seen


def _identifier_block(ocr_text: str) -> str:
    """The slice of the OCR text spanning the RR / Acc Id / M.R Code label group."""
    lines = [line.strip() for line in ocr_text.splitlines()]
    labels = re.compile(
        f"(?:{RR_LABEL})|(?:{ACC_ID_LABEL})|(?:{MR_CODE_LABEL})", re.IGNORECASE
    )
    hits = [index for index, line in enumerate(lines) if labels.search(line)]
    if not hits:
        return ""
    return "\n".join(lines[hits[0] : min(len(lines), hits[-1] + 6)])


def _bescom_identifier_repair(result: dict, flags: dict[str, str], ocr_text: str) -> None:
    """Correct RR / account / M.R code using structure the model cannot misalign.

    See the module-level "Quirks" note above for why this exists. Every
    correction is flagged low_confidence so the user still eyeballs it.
    """
    if not ocr_text:
        return

    block = _identifier_block(ocr_text)
    if not block:
        return

    rr_candidates = _unique(RR_TOKEN_RE.findall(block))
    digit_candidates = _unique(re.findall(r"\b\d{7,12}\b", block))

    has_acc_label = re.search(ACC_ID_LABEL, block, re.IGNORECASE) is not None
    has_mr_label = re.search(MR_CODE_LABEL, block, re.IGNORECASE) is not None

    rr_value = _find_labelled_value(block, RR_LABEL, RR_TOKEN_RE.pattern)
    if not rr_value and len(rr_candidates) == 1:
        rr_value = rr_candidates[0]

    acc_value: str | None = None
    mr_value: str | None = None
    if has_acc_label and has_mr_label and len(digit_candidates) == 2:
        longer, shorter = sorted(digit_candidates, key=len, reverse=True)
        if len(longer) != len(shorter):
            acc_value, mr_value = longer, shorter
    elif has_acc_label and not has_mr_label and len(digit_candidates) == 1:
        acc_value = digit_candidates[0]
    elif has_mr_label and not has_acc_label and len(digit_candidates) == 1:
        mr_value = digit_candidates[0]

    if rr_value and result.get("rr_number") != rr_value:
        result["rr_number"] = rr_value
        flags["rr_number"] = "low_confidence"

    if acc_value and result.get("account_number") != acc_value:
        result["account_number"] = acc_value
        flags["account_number"] = "low_confidence"

    if mr_value and result.get("mr_code") != mr_value:
        result["mr_code"] = mr_value
        flags["mr_code"] = "low_confidence"

    stray_value = mr_value or result.get("mr_code")
    if stray_value:
        for field in ("rr_number", "account_number"):
            if result.get(field) == stray_value:
                result[field] = None

    if result.get("account_number") and result.get("account_number") == result.get("rr_number"):
        result["account_number"] = None


QUIRKS = {
    "bescom_three_identifier_repair": _bescom_identifier_repair,
}


# --- Validation --------------------------------------------------------------


def validate_and_normalize(
    payload: dict, fields: list[dict], ocr_text: str = "", quirks: list[str] | None = None
) -> dict:
    """Coerce a raw model dict into the exact schema defined by `fields`."""
    quirks = quirks or []
    field_keys = {f["key"] for f in fields}

    result: dict = {f["key"]: _clean_str(payload.get(f["key"])) for f in fields}

    for f in fields:
        key = f["key"]
        normalizer = f.get("normalizer_type", "text")
        if normalizer == "text":
            result[key] = _strip_trailing_separators(result[key])
        elif normalizer == "digits":
            result[key] = _validate_digit_identifier(
                result[key], f.get("min_length") or 4, f.get("max_length") or 20
            )
        elif normalizer == "number":
            result[key] = _normalize_number(result[key])
        elif normalizer == "date":
            result[key] = _normalize_date(result[key])

    raw_flags = payload.get("confidence_flags")
    flags: dict[str, str] = {}
    if isinstance(raw_flags, dict):
        for field, flag in raw_flags.items():
            if field in field_keys and isinstance(flag, str) and flag in VALID_FLAGS:
                flags[field] = flag

    for quirk in quirks:
        handler = QUIRKS.get(quirk)
        if handler:
            handler(result, flags, ocr_text)

    for key in field_keys:
        if result[key] is None:
            flags[key] = "not_found"
        elif flags.get(key) == "not_found":
            flags[key] = "low_confidence"

    result["confidence_flags"] = flags
    return result


async def _call_groq(
    client: httpx.AsyncClient,
    api_key: str,
    model: str,
    system_prompt: str,
    ocr_text: str,
    max_attempts: int = 5,
) -> str:
    """Call Groq, retrying transient failures.

    Batch scans run several extractions at once, which makes it easy to trip
    Groq's tokens-per-minute limit even though each individual call is well
    within it. On a 429, Groq's response body states exactly how long the
    caller must wait for the window to clear (e.g. "try again in 2.6s") - that
    is honored here rather than guessed at with a short fixed backoff, which
    would just retry into the same exhausted window and burn all attempts
    before the quota actually recovers.
    """
    request = {
        "model": model,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Raw OCR text of the document:\n\n{ocr_text}"},
        ],
    }

    last_error = "Groq could not be reached."

    for attempt in range(1, max_attempts + 1):
        retry_after: float | None = None

        try:
            response = await client.post(
                GROQ_ENDPOINT, headers={"Authorization": f"Bearer {api_key}"}, json=request
            )
        except httpx.HTTPError as exc:
            last_error = f"Could not reach Groq: {exc}"
        else:
            if response.status_code == 200:
                body = response.json()
                try:
                    return body["choices"][0]["message"]["content"] or ""
                except (KeyError, IndexError, TypeError) as exc:
                    raise LlmError(f"Unexpected Groq response shape: {body}") from exc

            last_error = f"Groq API returned HTTP {response.status_code}: {response.text[:400]}"
            if response.status_code not in RETRYABLE_HTTP_STATUSES:
                raise LlmError(last_error)
            if response.status_code == 429:
                retry_after = _retry_after_seconds(response)

        if attempt == max_attempts:
            break

        if retry_after is not None:
            delay = retry_after + random.uniform(0.05, 0.3)
        else:
            delay = BACKOFF_BASE_SECONDS * (2 ** (attempt - 1)) + random.uniform(0, 0.4)

        logger.warning(
            "Groq attempt %d/%d failed (%s); retrying in %.1fs",
            attempt,
            max_attempts,
            last_error,
            delay,
        )
        await asyncio.sleep(delay)

    raise LlmError(f"{last_error} (after {max_attempts} attempts)")


async def parse_document(
    ocr_text: str,
    fields: list[dict],
    prompt_instructions: str | None = None,
    quirks: list[str] | None = None,
    api_key: str | None = None,
    model: str | None = None,
) -> dict:
    """Extract structured fields from OCR text using a template's field schema.

    Retries once on unparseable output; raises LlmParseError (carrying the raw
    model output) if both attempts fail.
    """
    api_key = api_key or os.getenv("GROQ_API_KEY")
    if not api_key:
        raise LlmError("GROQ_API_KEY is not set on the server.")

    model = model or os.getenv("GROQ_MODEL") or DEFAULT_MODEL
    quirks = quirks or []
    system_prompt = build_system_prompt(fields, prompt_instructions)

    last_raw = ""
    async with httpx.AsyncClient(timeout=90.0) as client:
        for attempt in (1, 2):
            prompt = system_prompt if attempt == 1 else system_prompt + RETRY_REMINDER
            last_raw = await _call_groq(client, api_key, model, prompt, ocr_text)
            try:
                return validate_and_normalize(_extract_json_object(last_raw), fields, ocr_text, quirks)
            except (json.JSONDecodeError, ValueError) as exc:
                logger.warning("Groq JSON parse failed on attempt %d: %s", attempt, exc)

    raise LlmParseError(
        "The model did not return valid JSON after a retry.", raw_response=last_raw
    )
