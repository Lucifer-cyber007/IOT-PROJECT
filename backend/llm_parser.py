"""Groq-backed extraction of structured bill fields from raw OCR text."""

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

FIELDS = (
    "name",
    "rr_number",
    "address",
    "account_number",
    "units_consumed",
    "amount_to_pay",
    "tariff",
    "bill_date",
)

VALID_FLAGS = {"low_confidence", "not_found"}

SYSTEM_PROMPT = """You extract structured billing data from the raw OCR text of an electricity bill.

Bills are often bilingual (Kannada/English on Karnataka BESCOM bills, Hindi/English elsewhere) and
OCR routinely splits a label from its value, or emits them on separate or reordered lines. Match
each value to its label by meaning, not by which line it happens to sit on. A number that appears
directly under a label is not necessarily that label's value.

Return ONLY a single valid JSON object. No markdown fences, no commentary, no explanation.

The object must have exactly these keys:
{
  "name": string | null,
  "rr_number": string | null,
  "address": string | null,
  "account_number": string | null,
  "units_consumed": string | null,
  "amount_to_pay": string | null,
  "tariff": string | null,
  "bill_date": string | null,
  "confidence_flags": { }
}

GENERAL
- NEVER invent a value. If a field is genuinely not present in the OCR text, use null.
- All eight field values are strings or null. Numbers must be returned as strings.
- A bill contains many similar-looking identifiers and many similar-looking amounts. Picking the
  wrong one is the most common failure. Read the label carefully before committing to a value.

FIELD RULES

"name" - the consumer / customer the bill is addressed to. Where the bill has a combined
  "Name and Address" block, the name is the leading segment before the address begins.

"rr_number" - the RR (Revenue Register) number.
  Labels: "RR No", "R.R. No.", "RRNO", "ಆರ್.ಆರ್.ಸಂಖ್ಯೆ".
  NEVER put the Account Id, M.R Code, Meter No or Bill No in this field.

"address" - the service / billing address on a single comma-separated line. Exclude the name.

"account_number" - the account / consumer / service number.
  Labels: "Acc Id", "Account No", "Account Id", "Consumer No", "CA No", "ಖಾತೆ ಸಂಖ್ಯೆ".
  NEVER put the M.R Code, Meter No, Bill No or RR number in this field. If the bill has no
  separate account number, return null rather than repeating another identifier.

TELLING THE THREE IDENTIFIERS APART
  Karnataka bills (BESCOM / MESCOM / HESCOM / GESCOM) print RR No, Acc Id and M.R Code
  stacked together, and OCR often lists all three labels first and all three values after,
  so position is NOT a reliable guide. Use their shape instead:
    - RR No    - contains LETTERS as well as digits, and starts with a letter (e.g. "W7EH7720").
                 If exactly one identifier on the bill has letters in it, that is the RR number.
    - Acc Id   - all digits, longer (commonly 10 digits, e.g. "7066318000").
    - M.R Code - all digits, shorter (commonly 8 digits, e.g. "14003418"). This is an internal
                 meter-reading route code. NEVER return it in any field.
  If you cannot confidently tell which value belongs to which label, return null for that field
  and flag it, rather than guessing.

"units_consumed" - electricity consumed during this billing period.
  Labels: "Consumption (Units)", "Units Consumed", "Units", "ಬಳಕೆ".
  Digits only, no unit suffix.
  CROSS-CHECK: if present and previous meter readings appear on the bill, consumption should equal
  (Present Reading - Previous Reading) x Constant. Use this to confirm you picked the right number.
  NEVER take these digits from the Bill No, Account Id, RR number, M.R Code, the meter readings
  themselves, Sanctioned Load, Recorded MD, Power Factor, or from the Unit/Rate/Amount columns of
  the charges breakdown table.

"amount_to_pay" - the FINAL net amount the consumer must pay.
  Prefer a line labelled "Net Payable", "Total Amount Payable", "Amount Payable",
  "ಪಾವತಿಯ ಮೊತ್ತ".
  This is usually NOT "Current Demand Payable" / "Cur.Demand Payable", which is computed before
  true-up charges, arrears and interest-on-deposit adjustments are applied. When both appear,
  take the net/final figure, which is normally the last one printed.
  Ignore individual charge lines, taxes, penalties, arrears, and any "amount payable after due
  date" figure.
  Strip currency symbols, commas and spaces, but keep the decimals as printed (e.g. "889.00").

"tariff" - the tariff code or category, e.g. "LT1", "LT-2(a)", "LT Domestic", "RGP".
  Labels: "Tariff", "ಜಕಾತಿ". This is not the Sanctioned Load (e.g. "0KW+2HP").

"bill_date" - the date the bill was issued, normalized to DD-MM-YYYY.
  Prefer an explicitly labelled bill / invoice / issue date.
  If no such label exists, fall back IN THIS ORDER and flag the field "low_confidence":
    1. the meter reading date ("Rdng. Date", "Reading Date", "ರೀಡಿಂಗ್ ದಿನಾಂಕ")
    2. the END date of the billing period (e.g. for "02/05/2026 - 02/06/2026" use 02/06/2026)
  NEVER use the due date. Only return null if the bill carries no usable date at all.

confidence_flags
- An object mapping field names to either "low_confidence" or "not_found".
- Include ONLY fields that need human review. Omit fields you are confident about.
- Use "not_found" for every field you set to null.
- Use "low_confidence" when you did return a best guess but the OCR text was garbled or ambiguous,
  the label was missing and you inferred the value from position, or you used a documented
  fallback such as the bill_date rules above.
"""

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
    """Drop separator punctuation left on the end of a name/address by the bill's layout."""
    if value is None:
        return None
    cleaned = value.rstrip(" .,;:-")
    return cleaned or None


# --- Identifier repair -------------------------------------------------------
#
# Bills stack several near-identical numeric identifiers (RR No, Acc Id, M.R Code)
# and OCR often emits every label in one block and every value in another, leaving
# no adjacency for the model to align on. It then guesses, and lands one row off.
# These rules re-derive the identifiers from the OCR text so the answer does not
# depend on the model getting a positional guess right.

# An RR-style token: starts with a letter, 6-16 chars, mixes letters and digits
# (e.g. "W7EH7720", "HB123456"). Deliberately excludes GSTNs, which start with
# digits, and short codes like "LT1" or "FY25".
RR_TOKEN_RE = re.compile(r"\b(?=[A-Z][A-Z0-9]{5,15}\b)(?=[A-Z0-9]*\d)[A-Z0-9]+\b")

RR_LABEL = r"R\.?\s*R\.?\s*(?:No|Number)"
MR_CODE_LABEL = r"M\.?\s*R\.?\s*Code"
ACC_ID_LABEL = (
    r"(?:Acc(?:ount)?\.?\s*(?:Id|No|Number)|Consumer\s*(?:No|Number)|CA\s*No|Service\s*No)"
)
LONG_DIGITS = r"\d{6,14}"


def _find_labelled_value(
    ocr_text: str, label_pattern: str, value_pattern: str, lookahead: int = 2
) -> str | None:
    """Find the value belonging to a label, on the same line or just below it.

    Stops at the next label so that a label-block/value-block layout does not
    silently pair a label with some other label's value.
    """
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
    """The slice of the OCR text spanning the RR / Acc Id / M.R Code label group.

    Working inside this window keeps unrelated long numbers elsewhere on the bill
    (bill numbers, phone numbers, ECS strings) out of the candidate pool.
    """
    lines = [line.strip() for line in ocr_text.splitlines()]
    labels = re.compile(
        f"(?:{RR_LABEL})|(?:{ACC_ID_LABEL})|(?:{MR_CODE_LABEL})", re.IGNORECASE
    )
    hits = [index for index, line in enumerate(lines) if labels.search(line)]
    if not hits:
        return ""
    # Values can trail the last label by several lines when OCR splits the columns.
    return "\n".join(lines[hits[0] : min(len(lines), hits[-1] + 6)])


def _repair_identifiers(result: dict, flags: dict[str, str], ocr_text: str) -> None:
    """Correct RR / account numbers using structure the model cannot misalign.

    Values are matched to fields by their SHAPE rather than their position, because
    OCR frequently emits all the labels in one block and all the values in another.
    On Karnataka bills the RR number is the only identifier containing letters, and
    the account id is reliably longer than the meter-reading route code.

    Every correction is flagged low_confidence so the user still eyeballs it.
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

    # RR number: prefer a value sitting with its own label, else the sole
    # letters-and-digits token in the block.
    rr_value = _find_labelled_value(block, RR_LABEL, RR_TOKEN_RE.pattern)
    if not rr_value and len(rr_candidates) == 1:
        rr_value = rr_candidates[0]

    # Account id vs M.R code: both all-digit, but the account id is longer.
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

    if rr_value and result["rr_number"] != rr_value:
        result["rr_number"] = rr_value
        flags["rr_number"] = "low_confidence"

    if acc_value and result["account_number"] != acc_value:
        result["account_number"] = acc_value
        flags["account_number"] = "low_confidence"

    # The M.R Code is an internal meter-reader route code, never something we return.
    if mr_value:
        for field in ("rr_number", "account_number"):
            if result[field] == mr_value:
                result[field] = None

    # The account number is its own field - it must not echo the RR number.
    if result["account_number"] and result["account_number"] == result["rr_number"]:
        result["account_number"] = None


def _normalize_amount(value: str | None) -> str | None:
    """Strip currency symbols, commas and spaces from a money string."""
    if value is None:
        return None
    cleaned = re.sub(r"[^\d.\-]", "", value.replace(",", ""))
    cleaned = cleaned.strip(".-")
    return cleaned or None


def _normalize_units(value: str | None) -> str | None:
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

    # Already DD-MM-YYYY (or with / or . separators).
    match = re.fullmatch(r"(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})", text)
    if match:
        day, month, year = match.groups()
        return f"{int(day):02d}-{int(month):02d}-{year}"

    # ISO: YYYY-MM-DD
    match = re.fullmatch(r"(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})", text)
    if match:
        year, month, day = match.groups()
        return f"{int(day):02d}-{int(month):02d}-{year}"

    # 12 Mar 2024 / 12-March-2024
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


def validate_and_normalize(payload: dict, ocr_text: str = "") -> dict:
    """Coerce a raw model dict into the exact response schema.

    When `ocr_text` is supplied, the identifier fields are additionally repaired
    against the source text - see `_repair_identifiers`.
    """
    result: dict = {}
    for field in FIELDS:
        result[field] = _clean_str(payload.get(field))

    result["name"] = _strip_trailing_separators(result["name"])
    result["address"] = _strip_trailing_separators(result["address"])
    result["amount_to_pay"] = _normalize_amount(result["amount_to_pay"])
    result["units_consumed"] = _normalize_units(result["units_consumed"])
    result["bill_date"] = _normalize_date(result["bill_date"])

    raw_flags = payload.get("confidence_flags")
    flags: dict[str, str] = {}
    if isinstance(raw_flags, dict):
        for field, flag in raw_flags.items():
            if field in FIELDS and isinstance(flag, str) and flag in VALID_FLAGS:
                flags[field] = flag

    _repair_identifiers(result, flags, ocr_text)

    # A null field always needs review, whatever the model claimed.
    for field in FIELDS:
        if result[field] is None:
            flags[field] = "not_found"
        elif flags.get(field) == "not_found":
            # Model flagged it not_found but did return a value - downgrade instead of dropping.
            flags[field] = "low_confidence"

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

    Batch uploads run several extractions at once, which makes it easy to trip
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
            {
                "role": "user",
                "content": f"Raw OCR text of the electricity bill:\n\n{ocr_text}",
            },
        ],
    }

    last_error = "Groq could not be reached."

    for attempt in range(1, max_attempts + 1):
        retry_after: float | None = None

        try:
            response = await client.post(
                GROQ_ENDPOINT,
                headers={"Authorization": f"Bearer {api_key}"},
                json=request,
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


async def parse_bill(ocr_text: str, api_key: str | None = None, model: str | None = None) -> dict:
    """Extract structured fields from OCR text, retrying once on unparseable output.

    Raises LlmParseError (carrying the raw model output) if both attempts fail.
    """
    api_key = api_key or os.getenv("GROQ_API_KEY")
    if not api_key:
        raise LlmError("GROQ_API_KEY is not set on the server.")

    model = model or os.getenv("GROQ_MODEL") or DEFAULT_MODEL

    last_raw = ""
    async with httpx.AsyncClient(timeout=90.0) as client:
        for attempt in (1, 2):
            system_prompt = SYSTEM_PROMPT if attempt == 1 else SYSTEM_PROMPT + RETRY_REMINDER
            last_raw = await _call_groq(client, api_key, model, system_prompt, ocr_text)
            try:
                return validate_and_normalize(_extract_json_object(last_raw), ocr_text)
            except (json.JSONDecodeError, ValueError) as exc:
                logger.warning("Groq JSON parse failed on attempt %d: %s", attempt, exc)

    raise LlmParseError(
        "The model did not return valid JSON after a retry.", raw_response=last_raw
    )
