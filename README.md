# Electricity Bill Extractor

Upload or photograph an electricity bill (image or PDF) and get the billing details back as
structured, editable data.

**Pipeline:** upload → PDF rasterized with PyMuPDF (if needed) → Google Cloud Vision
`DOCUMENT_TEXT_DETECTION` → Groq `llama-3.3-70b-versatile` field extraction → JSON.

## Stack

| Layer    | Tech |
| -------- | ---- |
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, react-webcam |
| Backend  | FastAPI, httpx |
| OCR      | Google Cloud Vision API (`images:annotate`, DOCUMENT_TEXT_DETECTION) |
| Parsing  | Groq API (`llama-3.3-70b-versatile`) |
| PDF prep | PyMuPDF (fitz), rendered at ~300 DPI in memory |

## Response schema

`POST /api/extract` always returns this shape:

```json
{
  "name": "RAMESH KUMAR S",
  "rr_number": "HB123456",
  "address": "No 42, 3rd Cross, Jayanagar 4th Block, Bengaluru 560011",
  "account_number": "1234567890",
  "units_consumed": "142",
  "amount_to_pay": "1245.60",
  "tariff": "LT-2(a)",
  "bill_date": "05-03-2024",
  "confidence_flags": { "account_number": "low_confidence" }
}
```

Every field is a string or `null`. `confidence_flags` only lists fields needing review, with a
value of `"low_confidence"` or `"not_found"`.

## Setup

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS / Linux
pip install -r requirements.txt

cp .env.example .env            # then fill in your API keys
uvicorn main:app --reload --port 8000
```

Get the keys from:
- **Vision** — enable the Cloud Vision API, then create an API key at
  <https://console.cloud.google.com/apis/credentials>
- **Groq** — <https://console.groq.com/keys>

`MOCK_MODE=1` in `.env` skips both API calls and returns fixed sample data, which is handy for
working on the frontend or smoke-testing the server before you have keys.

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

Open <http://localhost:3000>.

### Mobile app (Expo / React Native)

The mobile app talks to the same backend. Two things differ from the web setup:

1. The backend must listen on all interfaces, not just localhost:
   ```bash
   cd backend
   .venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000
   ```
2. `mobile/.env` must point at your machine's **LAN IP**, not `localhost` — on a phone,
   `localhost` is the phone itself:
   ```
   EXPO_PUBLIC_API_BASE_URL=http://192.168.0.3:8000
   ```
   Find your IP with `ipconfig` (Windows) or `ifconfig` (macOS/Linux). On the Android emulator
   you can instead use the special alias `http://10.0.2.2:8000`.

Then:

```bash
cd mobile
npm install
cp .env.example .env      # then set your LAN IP
npx expo start
```

Scan the QR code with **Expo Go** on your phone (same Wi-Fi network), or press `a` for an Android
emulator. Changing `.env` requires a bundler restart — `EXPO_PUBLIC_*` values are inlined at
build time.

To produce an installable APK:

```bash
npm install -g eas-cli
eas build -p android --profile preview
```

## API

### `POST /api/extract`

`multipart/form-data` with a single `file` field. Accepts JPG, PNG, WEBP and PDF up to 10 MB.
For PDFs, pages 1 and 2 are rasterized and OCR'd together.

Add `?include_raw_text=1` to get the raw OCR text back alongside the fields — useful when a
field comes out wrong and you want to see what the OCR actually produced.

| Status | Meaning |
| ------ | ------- |
| 200 | Extraction succeeded |
| 400 | Empty or unreadable file |
| 413 | File exceeds the size limit |
| 415 | Unsupported file type |
| 422 | OCR worked but the fields could not be structured — body includes `raw_text` and the UI falls back to manual entry |
| 502 | Vision or Groq call failed |

Transient Vision/Groq failures (429s, 5xx, `UNAVAILABLE`) are retried up to 3 times with
exponential backoff before the request is failed.

### `POST /api/extract-batch`

`multipart/form-data` with repeated `files` fields — up to 25 bills, processed 4 at a time.

Always responds **200** with a per-file result, so one bad photo never discards the rest of
the batch:

```json
{
  "succeeded": 2,
  "failed": 1,
  "results": [
    { "index": 0, "filename": "bill1.jpg", "status": "ok", "data": { ... } },
    { "index": 1, "filename": "notes.txt", "status": "error",
      "error": "Unsupported file type 'text/plain'. ..." }
  ]
}
```

Tune with `MAX_BATCH_FILES` and `BATCH_CONCURRENCY` in `.env`.

### `POST /api/export/xlsx`

Takes `{ "rows": [...], "filename": "bills.xlsx" }` and returns a formatted `.xlsx` download —
styled header, frozen top row, autofilter, and numeric columns stored as real numbers so Excel
can sum and sort them.

The frontend posts what is currently on screen rather than the original extraction, so any
corrections the user typed in are what land in the spreadsheet.

### `GET /api/health`

Reports server status and which API keys are configured.

## Notes

- **Camera:** browsers only expose `getUserMedia` over HTTPS or on `localhost`. To test the
  camera from a phone on your LAN, tunnel the dev server (e.g. `ngrok http 3000`) and point
  `NEXT_PUBLIC_API_BASE_URL` at a matching HTTPS backend URL.
- **CORS:** set `ALLOWED_ORIGINS` in the backend `.env` to a comma-separated list of origins
  for production.
- **Field accuracy:** the model is instructed never to invent values — a field it cannot find
  comes back `null` and flagged `not_found`. Everything is editable in the results view, so the
  user always has the last word.

## Project structure

```
backend/
  main.py            FastAPI app, CORS, routes, file validation
  vision_ocr.py      PDF→PNG rasterization + Google Vision call
  llm_parser.py      Groq call, JSON extraction, schema validation + retry
  requirements.txt
  .env.example
frontend/
  app/page.tsx              INPUT → PROCESSING → RESULTS state machine
  components/UploadPanel.tsx   Drag-and-drop + file picker with preview
  components/CameraPanel.tsx   Live camera, capture/retake, permission errors
  components/ResultsView.tsx   Editable fields, verify badges, JSON/CSV export
  lib/api.ts                   Fetch wrapper for /api/extract
  lib/types.ts                 Shared schema types and field metadata
  .env.local.example
mobile/
  App.tsx                      CAPTURE → PROCESSING → RESULTS state machine
  screens/CaptureScreen.tsx    Live camera, photo library, PDF picker, permission states
  screens/ProcessingScreen.tsx Spinner plus the error/retry state
  screens/ResultsScreen.tsx    Editable fields, verify badges, JSON copy, CSV share
  components/FieldCard.tsx     One labelled, editable field with its verify badge
  lib/api.ts                   Fetch wrapper for /api/extract (with timeout)
  lib/types.ts                 Same schema types as the web app
  lib/theme.ts                 Shared palette/spacing
  .env.example
```
