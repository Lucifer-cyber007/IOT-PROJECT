# WRV Energies — Multi-Asset IoT Monitoring Platform

Scan a document or gauge reading for any registered machine — an electricity bill, a UPS status
panel, an HVAC readout — and get structured data back automatically. The platform auto-detects
*which* machine a scan belongs to (by matching a printed serial/account/meter number against your
registered machines) and extracts fields using that machine's own template, instead of one fixed
schema for everything.

**Pipeline:** upload (single or up to 10 at once) → PDF rasterized with PyMuPDF (if needed) →
Google Cloud Vision `DOCUMENT_TEXT_DETECTION` → match against your registered machines → Groq
`llama-3.3-70b-versatile` extraction using that machine's field template → JSON.

## Multi-tenant model

- **Admin** provisions **clients** (tenants), defines **machine templates** (a reusable field
  schema per machine model — e.g. "BESCOM Residential Meter" or "APC Smart-UPS 3000"), and assigns
  **machines** (actual owned units, each with a real-world identifier) to clients.
- **Clients** log in (web or mobile), see only their own machines, and scan documents against
  them. Scanning is auto-detected by identifier match; if a scan can't be resolved to exactly one
  machine, the client picks from the candidates.
- Every machine belongs to one of 7 **asset classes**: Energy Meters, HVAC Systems, UPS, Data
  Center, Solar Inverters, DG Sets, Pumps & Motors.

## Stack

| Layer    | Tech |
| -------- | ---- |
| Backend  | FastAPI, SQLAlchemy + SQLite, JWT auth (PyJWT + bcrypt), httpx |
| Mobile   | Expo / React Native (SDK 54) |
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS — client portal + admin console, both against the multi-tenant API |
| OCR      | Google Cloud Vision API (`images:annotate`, DOCUMENT_TEXT_DETECTION) |
| Parsing  | Groq API (`llama-3.3-70b-versatile`), retried with backoff on transient failures |
| PDF prep | PyMuPDF (fitz), rendered at ~300 DPI in memory |

## Data model

| Table | What it is |
| ----- | ---------- |
| `Client` | A tenant/customer |
| `User` | A login — `role` is `"admin"` or `"client"`; client users are scoped to one `Client` |
| `AssetClass` | One of the 7 top-level categories (seeded once) |
| `MachineTemplate` | A reusable field schema for a machine model — field list (key/label/normalizer type), which field is the identifier, optional custom extraction prompt guidance |
| `Machine` | An actual owned unit — belongs to a `Client`, references a `MachineTemplate`, has its own real-world identifier value |
| `Reading` | A captured data point for a `Machine` — OCR or manual, with the extracted fields and confidence flags |

## Setup

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS / Linux
pip install -r requirements.txt

cp .env.example .env            # fill in API keys, JWT_SECRET, admin credentials
python seed.py                  # creates the 7 asset classes + your first admin login
uvicorn main:app --host 0.0.0.0 --port 8000
```

Get the keys from:
- **Vision** — enable the Cloud Vision API, then create an API key at
  <https://console.cloud.google.com/apis/credentials>
- **Groq** — <https://console.groq.com/keys>

Generate a `JWT_SECRET` with `python -c "import secrets; print(secrets.token_hex(32))"`.

Once seeded, log in as the admin (`POST /api/auth/login`) and use the admin endpoints below to
create a client, a machine template, and a machine — there's no admin console UI yet (see Known
gaps), so this is curl/Postman/whatever-you-like for now.

### Frontend (Next.js)

```bash
cd frontend
npm install
cp .env.local.example .env.local   # NEXT_PUBLIC_API_BASE_URL, defaults to http://localhost:8000
npm run dev
```

Open <http://localhost:3000> — it redirects to `/login`, then to `/dashboard` (client role) or
`/admin/clients` (admin role) depending on who logs in. There's no signup: seed the first admin
via `python seed.py` in the backend, then use the admin console's Users page (or
`POST /api/admin/users`) to create further admins or client logins. A brand-new client has no
asset classes populated until an admin creates at least one machine template and assigns a
machine to them.

Auth is a plain bearer token in `localStorage` (no cookies, no Next.js middleware) — the same
model the mobile app uses, just swapping `expo-file-system` for the browser's own storage.
Upload is drag-and-drop/file-picker only; there is no live camera capture on desktop (the mobile
app already owns that).

### Mobile app (Expo / React Native)

The backend must listen on all interfaces (`--host 0.0.0.0`, as above) and `mobile/.env` must
point at your machine's **LAN IP**, not `localhost` — on a phone, `localhost` is the phone itself:

```
EXPO_PUBLIC_API_BASE_URL=http://192.168.0.3:8000
```

Find your IP with `ipconfig` (Windows) or `ifconfig` (macOS/Linux). On the Android emulator you can
instead use the special alias `http://10.0.2.2:8000`.

```bash
cd mobile
npm install
cp .env.example .env      # then set your LAN IP
npx expo start
```

Scan the QR code with **Expo Go** (same Wi-Fi network), or press `a` for an Android emulator.
Changing `.env` requires a bundler restart — `EXPO_PUBLIC_*` values are inlined at build time.

Sign in with a **client**-role login (create one via `POST /api/admin/users` with
`"role": "client"`) — the app has no admin features, it's the client "quick access" view: browse
your asset classes, add machines, scan (single or batch, up to 10 files), review and save
readings.

To produce an installable APK:

```bash
npm install -g eas-cli
eas build -p android --profile preview
```

## API

All endpoints except `/api/health` and `/api/auth/login` require `Authorization: Bearer <token>`.

### Auth

| Endpoint | Role | What it does |
| -------- | ---- | ------------- |
| `POST /api/auth/login` | — | `{email, password}` → `{access_token, role, client_id}` |
| `GET /api/auth/me` | any | Current user info |

### Admin

| Endpoint | What it does |
| -------- | ------------- |
| `POST /api/admin/clients`, `GET /api/admin/clients` | Create / list clients |
| `POST /api/admin/users` | Create a login (admin or client-role, scoped to a `client_id`) |
| `GET /api/admin/asset-classes` | List the 7 seeded asset classes |
| `POST /api/admin/machine-templates`, `GET /api/admin/machine-templates` | Create / list machine templates (field schema, identifier field, optional custom prompt, optional quirks) |
| `POST /api/admin/machines`, `GET /api/admin/machines` | Assign a machine to any client |

### Client-scoped

| Endpoint | What it does |
| -------- | ------------- |
| `GET /api/asset-classes`, `GET /api/machine-templates` | Read-only reference data for building forms |
| `GET /api/machines`, `POST /api/machines` | List / self-register your own machines |
| `POST /api/scan` | Upload one document. Optional `machine_id` skips auto-detect; optional `asset_class_id` scopes candidates. Returns `{"status": "matched", "machine", "fields", "confidence_flags", "raw_text"}` or `{"status": "ambiguous"\|"no_match", "candidates", "raw_text"}` |
| `POST /api/scan/batch` | Same, for up to `MAX_BATCH_FILES` (default 10) documents at once — repeated `files` fields, processed `BATCH_CONCURRENCY` at a time. Always 200, one result per file; nothing is persisted until you call `POST /api/readings` |
| `POST /api/readings`, `GET /api/readings` | Save / list readings for your machines |

### `GET /api/health`

Reports server status and which API keys are configured.

## Notes

- **Auto-detect matching:** each `Machine` stores its real identifier value (serial/account/meter
  number). A scan is matched by checking whether that value appears in the OCR text (tolerant of
  OCR spacing noise). Zero or multiple matches fall back to letting the caller pick.
- **Field accuracy:** the model is instructed never to invent values — a field it cannot find comes
  back `null` and flagged `not_found`. Everything is editable before saving.
- **Retries:** transient Vision (429/5xx/retryable gRPC codes) and Groq (429/5xx, honoring Groq's
  stated wait time) failures are retried with backoff — this matters most for batch scans, which
  run several requests concurrently.
- **CORS:** set `ALLOWED_ORIGINS` in the backend `.env` to a comma-separated list of origins.

## Known gaps

- **No admin edit/delete anywhere.** `/api/admin/*` is create+list only — no `PATCH`/`DELETE` on
  clients, users, templates or machines, and no `GET /api/admin/users` (a created login cannot be
  listed or recovered after the fact — the admin Users page is a one-way form with a warning
  banner, by design, until a listing endpoint exists).
- **Admin has no visibility into readings.** Reading history is `require_client`-scoped only.

## Project structure

```
backend/
  main.py             FastAPI app, CORS, auth/admin/client routes, scan pipeline
  auth.py              Password hashing, JWT issuance/verification, role-scoped dependencies
  db.py                SQLAlchemy engine/session
  models.py             Client, User, AssetClass, MachineTemplate, Machine, Reading
  schemas.py            Pydantic request/response models
  matching.py           Identifier-based auto-detect for scanned documents
  seed.py                Bootstraps asset classes + first admin login
  vision_ocr.py         PDF→PNG rasterization + Google Vision call (with retry/backoff)
  llm_parser.py          Groq call, template-driven prompt + extraction, retry/backoff
  requirements.txt
  .env.example
frontend/
  app/login/page.tsx              Email/password sign-in
  app/page.tsx                     Redirect-only: resolves to /dashboard or /admin/clients by role
  app/(client)/layout.tsx          Client-role route guard + sidebar shell
  app/(client)/dashboard/          Asset-class grid with live counts
  app/(client)/asset-classes/[id]/ Machine list, add-asset form, entry to batch scan
  app/(client)/asset-classes/[id]/batch-scan/  Up to 10 files, review/resolve/save each
  app/(client)/machines/[id]/     Reading history table, manual-entry form
  app/(client)/scan/               Generic single-scan flow (any asset class)
  app/(client)/history/            All readings, asset-class filter, CSV export
  app/(client)/profile/            Account info, log out
  app/admin/layout.tsx             Admin-role route guard + sidebar shell
  app/admin/clients/               List + create
  app/admin/users/                 Create-only form (see Known gaps)
  app/admin/templates/             List + link to .../new
  app/admin/templates/new/         Full template form incl. FieldSchemaBuilder
  app/admin/machines/              Client-filtered list + link to .../new
  app/admin/machines/new/          Assign a machine to any client
  components/fields/FieldSchemaForm.tsx   Template-driven form - shared by manual entry,
                                    single-scan results, and batch-scan review
  components/admin/FieldSchemaBuilder.tsx Admin's field-schema editor (add/reorder/remove fields)
  components/scan/CandidatePicker.tsx     Ambiguous/no-match machine picker, shared by both scan flows
  components/scan/UploadDropzone.tsx      Drag-and-drop file picker (upload only, no camera)
  lib/api.ts                       Authenticated fetch client for every endpoint above
  lib/auth-context.tsx             3-state session (checking/signed-out/session), localStorage-backed
  lib/types.ts                     Wire-format types matching backend/schemas.py
  lib/csv.ts                       Client-side CSV export
mobile/
  App.tsx                Auth gate (LoginScreen vs the tab shell) + tab navigation
  lib/api.ts              Authenticated fetch client for every endpoint above
  lib/authStore.ts        Session token persistence
  lib/types.ts             Shared types (AssetClass, MachineTemplate, Machine, Reading)
  screens/LoginScreen.tsx        Email/password sign-in
  screens/HomeScreen.tsx          Dashboard - asset class grid with live counts
  screens/AssetClassScreen.tsx    Machines in a class, add-machine form, entry to Batch Scan
  screens/AssetDetailScreen.tsx   A machine's reading history, add-reading entry
  screens/ManualEntryScreen.tsx   Generic manual reading form, driven by the machine's template
  screens/ScanBillFlow.tsx        Single-shot scan flow (capture → auto-detect → review → save)
  screens/BatchScanFlow.tsx       Pick up to 10 files, batch scan, resolve/review/save each
  screens/ResultsScreen.tsx       Editable extracted fields, JSON copy, CSV share, save
  screens/HistoryScreen.tsx       All readings across every machine
  screens/ProfileScreen.tsx       Account info, log out
  components/FieldCard.tsx        One labelled, editable field with its verify badge
  components/SafeButton.tsx       Touchable wrapper (works around a device-specific paint bug)
  components/TabBar.tsx           Home / Scan Bill / History / Profile
  .env.example
```
