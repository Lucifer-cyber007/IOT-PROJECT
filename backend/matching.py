"""Auto-detect which registered machine a scanned document belongs to.

Each Machine stores the real-world identifier printed on it (serial number,
account number, meter code, ...). Matching is a tolerant substring check: OCR
routinely inserts/drops spaces and separators inside long numbers, so both the
stored identifier and the OCR text are reduced to bare alphanumerics before
comparing.
"""

from __future__ import annotations

import re

from models import Machine


def _normalize(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", value).upper()


def find_matching_machines(candidates: list[Machine], ocr_text: str) -> list[Machine]:
    """Return every candidate whose identifier value appears in the OCR text."""
    haystack = _normalize(ocr_text)
    if not haystack:
        return []

    matches: list[Machine] = []
    for machine in candidates:
        needle = _normalize(machine.identifier_value)
        # Guard against a trivially short identifier matching by pure chance.
        if len(needle) >= 4 and needle in haystack:
            matches.append(machine)
    return matches
