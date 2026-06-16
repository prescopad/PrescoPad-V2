# PrescoPad 2.0

> **Digital Clinic Management for Modern Doctors**

A full-featured clinic management app for doctors and assistants — built with **React Native (Expo)** + **Python FastAPI** + **MongoDB Atlas**. Handles patient queues, digital prescriptions, AI-powered consultation recording, wallet billing, analytics, and more.

**Live Backend:** https://prescopad-v2.onrender.com/api/health

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Roles & Access](#roles--access)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Backend API Reference](#backend-api-reference)
- [Database Schema](#database-schema)
- [Frontend Architecture](#frontend-architecture)
- [AI Transcription Feature](#ai-transcription-feature)
- [Build & Deployment](#build--deployment)

---

## Features

### 🏥 Patient & Queue Management
- **Patient Registration** — assistants add patients with name, age, gender, phone, address, medical history
- **Live Queue** — patients appear in the doctor's queue in real-time (10s polling)
- **Patient Search** — search patients by name or phone number across clinic history
- **Patient History** — full prescription history per patient, browsable by the doctor
- **Edit Patient** — update patient details at any time
- **Doctor can add patients directly** (solo mode — when no assistants are linked)

### 📋 Digital Prescription
- **Consultation Screen** — structured form: Diagnosis, Medicines, Lab Tests, Advice, Follow-up date
- **Medicine Picker** — search from 500+ seeded medicines + clinic-custom medicines; set dose, frequency, duration
- **Lab Test Picker** — search from standard lab test library + clinic-custom tests
- **Prescription Preview** — formatted A4 prescription with clinic header, doctor info, patient details, medicines, lab tests, diagnosis, advice, follow-up, and digital signature
- **Clinic Logo** on prescription header (Cloudinary-hosted)
- **Payment QR Code** on prescription (Cloudinary-hosted; e.g., UPI/PhonePe QR for easy patient payment)
- **Doctor Digital Signature** embedded on prescription (upload from gallery → Cloudinary)
- **Doctor can draw signature** with a finger on a canvas pad
- **PDF Generation** — generates a fully formatted A4 PDF of the prescription
- **WhatsApp Sharing** — share prescription PDF directly to patient's WhatsApp number
- **General Sharing** — share PDF via any app (email, Google Drive, etc.)

### 🤖 AI Consultation Recording
- **Record doctor–patient conversation** via device microphone during consultation
- **Set recording duration** — 3 / 5 / 10 / 15 minutes; extend by +1 min / +2 min during recording
- **Pause / Resume** recording
- **Groq Whisper** transcribes audio (whisper-large-v3-turbo model)
- **Groq LLaMA 4 Scout** diarizes conversation into Doctor / Patient speakers
- **LLaMA auto-extracts** structured prescription data: diagnosis, medicines (name, dose, frequency, duration), lab tests, advice, follow-up date
- **Auto-fills prescription form** — doctor just reviews and saves
- **Transcript History** — all past transcripts per patient with expandable diarized segments and extracted medical summary

### 💰 Wallet & Billing
- **₹1 deducted per issued prescription** automatically
- **Wallet Balance** displayed on doctor dashboard
- **Transaction History** — full ledger of debits and credits
- **Low Balance Alert** — warning when balance drops below threshold
- **Admin Recharge** — admin adds credits to any doctor's wallet

### 🏢 Clinic Profile Management
- **Clinic Details** — name, address, phone, email
- **Clinic Logo Upload** — upload from gallery → Cloudinary → shown on prescriptions
- **Payment QR Code Upload** — upload UPI/QR image from gallery → Cloudinary → printed on prescriptions
- **Doctor Info** — name, specialty, registration number (shown on prescription header)

### 👤 User Profile
- **Doctor Profile** — edit name, phone, specialty, registration number
- **Assistant Profile** — edit name, phone, qualification, experience years, city, address
- **Profile card** in Settings is tappable to open profile editor
- Phone number change includes uniqueness validation

### 🔗 Doctor–Assistant Linking
- **Doctor Code** — unique code generated for each doctor (visible in Connection screen)
- **Assistant joins** by entering the doctor's code
- **Doctor can invite** an assistant directly by phone number
- **Member Management** — doctor can view and remove clinic members
- **Multiple assistants** can be linked to one doctor/clinic

### 📊 Analytics Dashboard (Doctor)
- **Prescription count** — daily, weekly, monthly trends
- **Revenue** — earnings per period
- **Top Medicines** — most frequently prescribed medicines
- **Patient trends** — new vs returning patients
- **Charts** with visual data representation

### 🌐 Multi-language Support
- Full **i18n** support via react-i18next
- Languages: **English**, **Hindi (हिन्दी)**, **Marathi (मराठी)**
- Language switcher in Settings

### 🔐 Authentication
- **Phone-based OTP login** via Twilio SMS
- **Password login** for admins
- **JWT access + refresh tokens** (auto-refresh on expiry)
- **Demo mode** — fixed OTP `123456` for development without SMS
- **Secure token storage** via Expo SecureStore
- **Heartbeat** — app pings backend every 60s to maintain active session

### 🛡️ Admin Panel
- **Admin Dashboard** — overview of all clinics, doctors, assistants
- **User Management** — view all users by role
- **Clinic Management** — view all clinics and their details
- **Patient Overview** — across all clinics
- **Revenue Analytics** — platform-wide earnings

### ⚙️ Custom Medicine & Lab Test Management
- Add **custom medicines** per clinic (on top of the 500+ seeded library)
- Add **custom lab tests** per clinic
- Edit and delete custom entries

### 🔔 Notifications
- Backend notification job system (push notification ready)

### ♾️ Render Keep-Alive
- Backend has **built-in self-ping** every 14 minutes (`/api/health`) to prevent Render free-tier idle shutdown
- External [`keep_alive.py`](backend_python/scripts/keep_alive.py) script pings from your local PC as an extra layer
- Compatible with UptimeRobot (external free monitor)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile Frontend | React Native 0.81, Expo ~54, TypeScript 5.9 |
| State Management | Zustand 5 |
| Local Database | Expo SQLite (WAL mode) |
| Navigation | React Navigation 7 (stack + bottom tabs) |
| HTTP Client | Axios with JWT refresh interceptor |
| Token Storage | Expo SecureStore |
| Image Upload | Cloudinary (unsigned upload preset) |
| Backend Framework | FastAPI 0.115, Python 3.13 |
| Async DB Driver | Motor 3.5 (AsyncIOMotorClient) |
| Cloud Database | MongoDB Atlas |
| Authentication | JWT (python-jose) + bcrypt |
| AI Transcription | Groq API — Whisper large-v3-turbo + LLaMA 4 Scout |
| Audio Recording | expo-av |
| PDF Generation | expo-print |
| Sharing | expo-sharing |
| SMS OTP | Twilio |
| TLS/SSL | certifi (required for Python 3.13 + Atlas) |
| Deployment | Render (backend), EAS (APK / Play Store) |

---

## Roles & Access

| Feature | Doctor | Assistant | Admin |
|---|---|---|---|
| View patient queue | ✅ | ✅ | ❌ |
| Add patient to queue | ✅ (solo mode) | ✅ | ❌ |
| Start consultation | ✅ | ❌ | ❌ |
| Write prescription | ✅ | ❌ | ❌ |
| AI Consultation Recording | ✅ | ❌ | ❌ |
| View transcript history | ✅ | ❌ | ❌ |
| View prescription PDF | ✅ | ✅ | ❌ |
| Share prescription on WhatsApp | ✅ | ✅ | ❌ |
| View analytics | ✅ | ❌ | ❌ |
| Manage clinic profile | ✅ | ❌ | ✅ |
| Upload logo / QR / signature | ✅ | ❌ | ❌ |
| View wallet | ✅ | ✅ | ✅ |
| Recharge wallet | ❌ | ❌ | ✅ |
| Invite / remove members | ✅ | ❌ | ❌ |
| Edit own profile | ✅ | ✅ | ❌ |
| Manage all clinics & users | ❌ | ❌ | ✅ |
| Platform-wide analytics | ❌ | ❌ | ✅ |

---

## Project Structure

```
PrescoPad-V2/
├── frontend/                          # Expo React Native app
│   ├── src/
│   │   ├── screens/
│   │   │   ├── auth/                  # Landing, Login, OTP, Registration
│   │   │   ├── doctor/
│   │   │   │   ├── DoctorDashboard        # Queue view + wallet balance
│   │   │   │   ├── ConsultScreen          # Write prescription
│   │   │   │   ├── MedicinePickerScreen   # Search & add medicines
│   │   │   │   ├── LabTestPickerScreen    # Search & add lab tests
│   │   │   │   ├── PrescriptionPreviewScreen  # Preview + PDF + share
│   │   │   │   ├── RxSuccessScreen        # Post-issue confirmation
│   │   │   │   ├── PatientHistoryScreen   # Past prescriptions
│   │   │   │   ├── AnalyticsScreen        # Charts + stats
│   │   │   │   └── DoctorAddPatientHubScreen
│   │   │   ├── assistant/
│   │   │   │   ├── AssistantDashboard     # Queue + patient add
│   │   │   │   ├── AddPatientScreen       # Register new patient
│   │   │   │   ├── PatientSearchScreen    # Search patients
│   │   │   │   └── PatientDetailScreen    # Patient details + Rx history
│   │   │   ├── admin/
│   │   │   │   ├── AdminOverviewScreen    # Platform stats
│   │   │   │   ├── AdminUsersScreen       # All users
│   │   │   │   ├── AdminClinicsScreen     # All clinics
│   │   │   │   ├── AdminPatientsScreen    # All patients
│   │   │   │   └── AdminRevenueScreen     # Revenue analytics
│   │   │   ├── shared/
│   │   │   │   ├── ClinicProfileScreen    # Clinic info + logo + QR + signature
│   │   │   │   ├── UserProfileScreen      # Personal profile editor
│   │   │   │   ├── SettingsScreen         # Language, logout, navigation hub
│   │   │   │   ├── WalletScreen           # Balance + transactions
│   │   │   │   ├── ConnectionScreen       # Link doctor ↔ assistant
│   │   │   │   ├── PatientFormScreen      # Add/edit patient form
│   │   │   │   └── PrescriptionViewScreen # Read-only prescription view
│   │   │   └── settings/
│   │   │       └── MedicineTestManagementScreen  # Custom meds & tests
│   │   ├── navigation/
│   │   │   ├── RootNavigator.tsx          # Auth check → role routing
│   │   │   ├── AuthStack.tsx
│   │   │   ├── DoctorTabNavigator.tsx
│   │   │   └── AssistantTabNavigator.tsx
│   │   ├── store/                         # Zustand stores
│   │   │   ├── useAuthStore.ts            # User, tokens, login/logout
│   │   │   ├── usePrescriptionStore.ts    # Draft prescription
│   │   │   ├── usePatientStore.ts         # Patient list cache
│   │   │   ├── useClinicStore.ts          # Clinic info + doctor profile
│   │   │   ├── useWalletStore.ts          # Balance + transactions
│   │   │   ├── useQueueStore.ts           # Live queue + polling
│   │   │   └── useAnalyticsStore.ts       # Summary stats + charts
│   │   ├── services/
│   │   │   ├── api.ts                     # Axios + auto token refresh
│   │   │   ├── authService.ts             # Auth + profile APIs
│   │   │   ├── dataService.ts             # Patients, prescriptions, queue
│   │   │   ├── walletService.ts           # Wallet + transactions
│   │   │   ├── pdfService.ts              # HTML→PDF generation
│   │   │   ├── shareService.ts            # WhatsApp + general share
│   │   │   ├── cloudinaryService.ts       # Image uploads
│   │   │   ├── connectionService.ts       # Clinic member linking
│   │   │   ├── analyticsService.ts        # Stats APIs
│   │   │   ├── adminService.ts            # Admin-only APIs
│   │   │   └── cryptoService.ts           # Token encryption helpers
│   │   ├── database/
│   │   │   ├── database.ts                # SQLite init, schema, WAL mode
│   │   │   └── seed.ts                    # 500+ medicines + lab test seed
│   │   ├── types/                         # TypeScript interfaces
│   │   ├── hooks/                         # useKeyboardHeight, etc.
│   │   ├── i18n/                          # Translations (en, hi, mr)
│   │   └── constants/
│   │       ├── config.ts                  # Backend URL, wallet limits
│   │       └── theme.ts                   # Colors, spacing, typography
│   ├── App.tsx
│   ├── app.config.ts
│   ├── eas.json
│   └── package.json
│
├── backend_python/                    # FastAPI backend
│   ├── app/
│   │   ├── main.py                    # App factory, CORS, lifespan, keep-alive
│   │   ├── config/
│   │   │   ├── settings.py            # Pydantic Settings (reads .env)
│   │   │   └── database.py            # Motor connection + index creation
│   │   ├── routes/
│   │   │   ├── auth.py                # OTP, login, profile, heartbeat
│   │   │   ├── data.py                # Patients, prescriptions, queue, medicines
│   │   │   ├── wallet.py              # Balance, transactions, recharge
│   │   │   ├── clinic.py              # Clinic profile CRUD
│   │   │   ├── connection.py          # Doctor–assistant linking
│   │   │   ├── notification.py        # Push notification jobs
│   │   │   ├── analytics.py           # Summary stats, top medicines
│   │   │   └── admin.py               # Admin-only endpoints
│   │   ├── services/                  # Business logic layer
│   │   ├── models/                    # Pydantic schemas
│   │   ├── middleware/
│   │   │   └── auth.py                # JWT verification
│   │   └── utils/
│   │       ├── jwt.py
│   │       ├── hash.py
│   │       ├── otp.py
│   │       └── response.py
│   ├── scripts/
│   │   └── keep_alive.py              # External Render keep-alive script
│   ├── requirements.txt
│   └── .env                           # Not committed — see env vars below
│
└── README.md
```

---

## Getting Started

### Prerequisites

- Python 3.10+ (3.13 recommended)
- Node.js 18+ and npm
- MongoDB Atlas cluster (free tier works)
- Expo Go app on your Android/iOS phone

### 1 — Backend Setup

```bash
cd backend_python

# Create virtual environment
python -m venv .venv

# Activate (Windows PowerShell)
.\.venv\Scripts\Activate.ps1
# Activate (macOS/Linux)
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env (copy values from Environment Variables section below)
# Start development server
python -m uvicorn app.main:app --host 0.0.0.0 --port 3000 --reload
```

API running at `http://localhost:3000` — health check: `GET /api/health`

### 2 — Frontend Setup

```bash
cd frontend
npm install
npx expo start -c
```

Scan the QR code with **Expo Go** (Android) or the Camera app (iOS).
The app auto-detects your local backend IP — phone and PC must be on the same Wi-Fi.

---

## Environment Variables

Create `backend_python/.env`:

```env
# Server
PORT=3000
NODE_ENV=development

# MongoDB Atlas
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?appName=<AppName>
MONGODB_DB_NAME=prescopad

# JWT
JWT_SECRET=change-this-in-production
JWT_EXPIRES_IN=7
JWT_REFRESH_SECRET=change-this-refresh-secret
JWT_REFRESH_EXPIRES_IN=30

# OTP via Twilio
OTP_DEMO_MODE=true           # true = uses fixed OTP 123456 (dev only)
OTP_DEMO_CODE=123456
TWILIO_ACCOUNT_SID=ACxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
TWILIO_FROM_NUMBER=+1xxxxxxxxxx

# Admin seed (creates admin account on first startup)
SEED_ADMIN=true
ADMIN_PHONE=9999900000
ADMIN_PASSWORD=ChangeMe!1

# CORS (comma-separated origins; * allows all in dev)
ALLOWED_ORIGINS=*

# Rate limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
```

Create `frontend/.env`:

```env
# Production backend URL (used by EAS builds)
BACKEND_URL=https://prescopad-v2.onrender.com/api

# Cloudinary (for unsigned image uploads)
EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloud_name
EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET=your_upload_preset
```

> **Never commit `.env` files.** Both are in `.gitignore`.

---

## Backend API Reference

Base URL: `https://prescopad-v2.onrender.com` (production) or `http://localhost:3000` (dev)

All protected routes require: `Authorization: Bearer <access_token>`

### Auth — `/api/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/send-otp` | No | Send OTP to phone |
| POST | `/verify-otp` | No | Verify OTP → returns tokens + user |
| POST | `/login` | No | Phone + password login (admin) |
| POST | `/refresh-token` | No | Refresh access token |
| GET | `/me` | Yes | Get current user |
| POST | `/complete-registration` | Yes | Set name, specialty, clinic info |
| PUT | `/profile` | Yes | Update name, phone, specialty, etc. |
| POST | `/heartbeat` | Yes | Keep session alive |

### Data — `/api/data`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/patients` | Yes | List clinic patients |
| POST | `/patients` | Yes | Create patient |
| PUT | `/patients/:id` | Yes | Update patient |
| GET | `/queue` | Yes | Get current queue |
| POST | `/queue` | Yes | Add patient to queue |
| DELETE | `/queue/:id` | Yes | Remove from queue |
| POST | `/prescriptions` | Yes | Save prescription (deducts ₹1 from wallet) |
| GET | `/prescriptions/patient/:id` | Yes | Patient prescription history |
| GET | `/medicines/custom` | Yes | Clinic custom medicines |
| POST | `/medicines/custom` | Yes | Add custom medicine |
| DELETE | `/medicines/custom/:id` | Yes | Delete custom medicine |
| GET | `/lab-tests/custom` | Yes | Clinic custom lab tests |
| POST | `/lab-tests/custom` | Yes | Add custom lab test |
| DELETE | `/lab-tests/custom/:id` | Yes | Delete custom lab test |

### Wallet — `/api/wallet`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Yes | Get balance + transaction history |
| POST | `/recharge` | Yes (Admin) | Add credits to a wallet |

### Clinic — `/api/clinic`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Yes | Get clinic profile |
| PUT | `/` | Yes | Update clinic (name, address, logo, QR code, etc.) |
| GET | `/doctor-profile` | Yes | Get doctor details for clinic |
| PUT | `/doctor-profile` | Yes | Update doctor name, specialty, reg number |

### Connection — `/api/connection`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/invite` | Yes (Doctor) | Invite assistant by phone |
| POST | `/join` | Yes (Assistant) | Join clinic using doctor code |
| GET | `/members` | Yes | List clinic members |
| DELETE | `/members/:id` | Yes (Doctor) | Remove a member |

### Analytics — `/api/analytics`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/summary` | Yes | Prescription count, revenue, patient trends |
| GET | `/medicines` | Yes | Top prescribed medicines |

### Admin — `/api/admin`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/overview` | Admin | Platform-wide stats |
| GET | `/users` | Admin | All users (doctors + assistants) |
| GET | `/clinics` | Admin | All clinics |
| GET | `/patients` | Admin | All patients |
| GET | `/revenue` | Admin | Revenue breakdown |

### Health

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Server status + version |

---

## Database Schema

MongoDB Atlas — database: `prescopad`

| Collection | Key Indexes |
|---|---|
| `doctors` | `phone` (unique), `doctor_code` (unique sparse), `clinic_id` |
| `assistants` | `phone` (unique), `clinic_id` |
| `admins` | `phone` (unique) |
| `clinics` | `owner_id` |
| `wallets` | `user_id` (unique) |
| `transactions` | `wallet_id`, `created_at` |
| `patients` | `clinic_id`, `(clinic_id, phone)`, `(clinic_id, name)` |
| `prescriptions` | `clinic_id`, `patient_id`, `doctor_id`, `created_at` |
| `queue` | `clinic_id`, `patient_id`, `(clinic_id, added_at)` |
| `connection_requests` | `(doctor_id, assistant_id)`, `clinic_id` |
| `custom_medicines` | `(clinic_id, name)` unique |
| `custom_lab_tests` | `(clinic_id, name)` unique |
| `notification_jobs` | `user_id`, `status` |
| `transcripts` | `clinic_id`, `patient_id`, `doctor_id`, `created_at` |

---

## Frontend Architecture

### Role-based Navigation

```
App
└── RootNavigator
    ├── AuthStack              (unauthenticated)
    │   ├── Landing
    │   ├── Login
    │   ├── OTP
    │   └── Registration
    ├── DoctorTabNavigator     (role = doctor)
    │   ├── Queue Tab
    │   │   ├── DoctorDashboard
    │   │   ├── Consult
    │   │   ├── MedicinePicker
    │   │   ├── LabTestPicker
    │   │   ├── PrescriptionPreview
    │   │   ├── RxSuccess
    │   │   └── PatientHistory
    │   ├── Patients Tab
    │   │   ├── DoctorAddPatientHub
    │   │   ├── AddPatient
    │   │   ├── PatientSearch
    │   │   └── PatientDetail
    │   └── Settings Tab
    │       ├── Settings
    │       ├── UserProfile
    │       ├── ClinicProfile
    │       ├── Connection
    │       ├── MedicineTestManagement
    │       ├── Wallet
    │       └── Analytics
    └── AssistantTabNavigator  (role = assistant)
        ├── Queue Tab
        │   ├── AssistantDashboard
        │   ├── PatientSearch
        │   └── PatientDetail
        ├── Add Patient Tab
        └── Settings Tab
            ├── Settings
            ├── UserProfile
            ├── ClinicProfile
            ├── Connection
            └── MedicineTestManagement
```

### State Management (Zustand)

| Store | Responsibility |
|---|---|
| `useAuthStore` | Current user, tokens, login/logout, session restore |
| `usePrescriptionStore` | Active draft (medicines, lab tests, diagnosis, advice, follow-up) |
| `usePatientStore` | Patient list cache |
| `useClinicStore` | Clinic info, doctor profile, member list |
| `useWalletStore` | Balance, transaction history |
| `useQueueStore` | Live queue, polling (10s interval), add/remove |
| `useAnalyticsStore` | Summary stats and chart data |

### API Contract

The Python backend returns `snake_case` fields. All service functions normalize to `camelCase` for the TypeScript layer. The `api.ts` Axios instance handles automatic token refresh on 401 responses.

---

## AI Transcription Feature

**Full Flow:**

1. Doctor opens a consultation → taps **AI Consultation Recording** (microphone icon)
2. Sets recording duration (3 / 5 / 10 / 15 min) → taps **Start Recording**
3. Records doctor–patient conversation via device microphone (`expo-av`)
4. Controls during recording:
   - **Pause / Resume**
   - **+1 min / +2 min** time extension (capped at 30 min)
   - **Discard** — cancels and deletes audio
   - **Stop & Analyze** — sends audio to backend
5. Backend pipeline (`POST /api/transcription/analyze`):
   - **Groq Whisper** (`whisper-large-v3-turbo`) → raw transcript
   - **Groq LLaMA 4 Scout** → speaker diarization (Doctor / Patient)
   - **Groq LLaMA 4 Scout** → structured extraction: diagnosis, medicines (name, dose, frequency, duration), lab tests, advice, follow-up date
   - Transcript + extraction saved to `transcripts` collection
6. Frontend auto-fills prescription draft and navigates back to Consult screen
7. Doctor reviews, edits if needed, and saves

**Transcript History** — accessible from patient history; shows all transcripts with expandable diarized segments and extracted medical summary.

---

## Build & Deployment

### Build Android APK (via EAS)

```bash
cd frontend

# Install EAS CLI (if not installed)
npm install -g eas-cli

# Login to Expo account
eas login

# Set production backend URL as EAS secret (one time)
eas secret:create --scope project --name BACKEND_URL --value "https://prescopad-v2.onrender.com/api"

# Build installable APK (preview profile)
eas build --platform android --profile preview

# Build production AAB for Play Store
eas build --platform android --profile production
```

Build runs on Expo's cloud servers — no Android Studio required. Takes ~10–15 minutes.

### Deploy Backend to Render

1. Push `backend_python/` to a GitHub repo
2. Create a **Web Service** on [render.com](https://render.com)
3. Set these fields:

| Field | Value |
|---|---|
| Runtime | `Python 3` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |

4. Add all environment variables from `.env` in the Render dashboard
5. Set `NODE_ENV=production` and `OTP_DEMO_MODE=false`
6. Use strong random values for `JWT_SECRET` and `JWT_REFRESH_SECRET`

### Keep Render Free-Tier Alive

The backend has a built-in self-ping loop in `main.py` that hits `/api/health` every 14 minutes.
For extra reliability, run the included script from your local machine:

```bash
python backend_python/scripts/keep_alive.py
```

Or set up a free monitor at [UptimeRobot](https://uptimerobot.com) pointing to `https://prescopad-v2.onrender.com/api/health` every 5 minutes.

### Important Production Notes

- Set `ALLOWED_ORIGINS` to your app's domain/bundle ID (not `*`)
- MongoDB Atlas IP Access List must include your Render server IP (or `0.0.0.0/0` for dev)
- Python 3.13 requires `certifi` for TLS — included in `requirements.txt`
- Never commit `.env` files to version control

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make changes and test locally (run backend + Expo)
4. Open a pull request against `main`

Do not commit `.env` files, secrets, or build artifacts.

---

*Last updated: June 2026*
