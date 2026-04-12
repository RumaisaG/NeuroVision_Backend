# NeuroVision — Backend API

REST API for the NeuroVision Alzheimer's MRI Analysis Platform. Built with Node.js and Express, it handles authentication, scan management, ML inference orchestration, and AI-powered clinical report generation

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Environment Variables](#environment-variables)
- [Getting Started](#getting-started)
- [Testing](#testing)
- [Deployment](#deployment)

---

## Overview

The backend sits at the centre of the NeuroVision platform. It receives MRI uploads from the Vue.js frontend, stores images in Supabase Storage, sends images to the FastAPI ML microservice for DenseNet-169 classification, saves structured results to MongoDB, generates AI-authored clinical PDF reports via PDFKit and Gemini 2.5 Flash, and serves a contextual AI chatbot grounded in each scan's clinical data.

---

## Tech Stack

| Category | Technology |
|---|---|
| Runtime | Node.js 20 LTS |
| Framework | Express.js 4 |
| Database | MongoDB Atlas (Mongoose ODM) |
| File Storage | Supabase Storage |
| Authentication | JWT dual-token (access 15m + refresh 7d httpOnly cookie) |
| Password hashing | bcryptjs (12 salt rounds) |
| AI Chatbot | Google Gemini 2.5 Flash (`@google/generative-ai`) |
| PDF generation | PDFKit |
| File uploads | Multer (memory storage) |
| HTTP client | Axios |
| Testing | Jest 29 + Supertest + mongodb-memory-server |

---

## Architecture

```
Vue.js Frontend
      │  HTTPS  Bearer token / httpOnly cookie
      ▼
Express.js API  (this repository)
      ├── MongoDB Atlas      — users, scans, analyses (metadata)
      ├── Supabase Storage   — MRI images + Grad-CAM PNGs (binary) + Reports
      ├── FastAPI ML Service — DenseNet-169 classification + Grad-CAM++
      └── Google Gemini API  — AI chatbot + PDF narrative generation
```

**JWT dual-token strategy**: The access token (15 min) is returned in the response body and stored in Pinia memory only — never in `localStorage`. The refresh token (7 days) is set as an `httpOnly`, `secure`, `sameSite=none` cookie. The frontend Axios interceptor silently calls `POST /api/auth/refresh` when a `TOKEN_EXPIRED` code is received, without the user noticing.

---

## Project Structure

```
backend/
├── controllers/
│   ├── analysisController.js   # Analysis retrieval endpoints
│   ├── authController.js       # Register, login, logout, refresh, me
│   ├── chatController.js       # AI chatbot message handler
│   ├── scanController.js       # Upload, analyse, list, get, delete, report
│   └── userController.js       # Profile, password, stats, account deletion
├── middleware/
│   ├── authMiddleware.js       # JWT protect() — Bearer header + ?token= fallback
│   ├── errorMiddleware.js      # Global error handler
│   └── uploadMiddleware.js     # Multer memory storage (50MB limit)
├── models/
│   ├── Analysis.js             # predictedClass, confidence, probabilities, gradCamUrl
│   ├── Scan.js                 # storagePath, publicUrl, patient, status, reportUrl
│   └── User.js                 # email, passwordHash (bcrypt), role, isActive
├── routes/
│   ├── analysisRoutes.js
│   ├── authRoutes.js
│   ├── chatRoutes.js
│   ├── scanRoutes.js
│   └── userRoutes.js
├── services/
│   ├── analysisService.js      # CRUD for Analysis documents
│   ├── chatService.js          # buildContext() + Gemini chat
│   ├── mlService.js            # POST to FastAPI, Grad-CAM decode, label mapping
│   ├── pdfService.js           # PDFKit layout + Gemini narrative
│   └── storageService.js       # Supabase upload/delete for MRI + Grad-CAM
├── tests/
│   ├── integration/
│   │   ├── auth.routes.test.js
│   │   ├── scan.routes.test.js
│   │   ├── security.blackbox.test.js
│   │   └── user.routes.test.js
│   │   
│   ├── unit/
│   │   ├── services/
│   │   │   ├── analysisService.test.js
│   │   │   └── mlService.test.js
│   │   ├── auth.middleware.test.js
│   │   ├── scan.analysis.model.test.js
│   │   └── user.model.test.js
│   ├── globalSetup.js
│   └── setup.js
├── .env.example
├── .gitignore
├── jest.config.js
├── package.json
└── server.js
```

---

## API Reference

All routes are prefixed with `/api`. Protected routes require `Authorization: Bearer <accessToken>`.

### Authentication — `/api/auth`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/register` | — | Create account. Returns `accessToken` + sets `refreshToken` cookie |
| `POST` | `/login` | — | Login. Returns `accessToken` + sets `refreshToken` cookie |
| `POST` | `/logout` | — | Clears `refreshToken` cookie |
| `POST` | `/refresh` | cookie | Exchanges `refreshToken` cookie for new `accessToken` |
| `GET` | `/me` |  | Returns authenticated user profile |

**Register / Login request body:**
```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@hospital.com",
  "password": "SecurePass123",
  "role": "Neurologist"
}
```

**Valid roles:** `Neurologist`, `Radiologist`, `General Practitioner`, `Researcher`, `Medical Student`

---

### Scans — `/api/scans`

All scan routes require authentication.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/` | Upload MRI scan (multipart/form-data). Stores image in Supabase |
| `POST` | `/analyse` | Run DenseNet-169 classification on an uploaded scan |
| `GET` | `/` | List all scans for the authenticated user |
| `GET` | `/:id` | Get a single scan with populated analysis |
| `DELETE` | `/:id` | Delete scan + analysis + Supabase files |
| `GET` | `/:id/report` | Download PDF report (supports `?token=` for browser downloads) |
| `POST` | `/:id/report` | Generate or regenerate a PDF report |

**Upload form fields:**
```
scan          (file)    — MRI file (.jpg, .png, .dcm, .nii)
hasPatient    (string)  — "true" | "false"
fullName      (string)  — patient full name (if hasPatient)
age           (number)  — patient age
gender        (string)  — Male | Female | Other | Prefer not to say
gradCamEnabled(string)  — "true" | "false"
reportEnabled (string)  — "true" | "false"
```

**Analyse request body:**
```json
{ "scanId": "64f1a2b3c4d5e6f7a8b9c0d1" }
```

---

### Users — `/api/users`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/me` | Get user profile |
| `PATCH` | `/me` | Update name, role, institution |
| `PATCH` | `/me/password` | Change password (requires current password) |
| `GET` | `/me/stats` | Analytics: total scans, stage counts, weekly/monthly trends |
| `DELETE` | `/me` | Delete account and all associated scan data |

---

### Chat — `/api/chat`

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/:scanId` | Send a message. Body: `{ message, history }` |

The chatbot receives the full scan context (stage, confidence, probabilities, patient data, Grad-CAM status, report status) and is grounded to that data via `buildContext()`.

---

### Analyses — `/api/analyses`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/scan/:scanId` | Get analysis for a specific scan |
| `GET` | `/` | Get all analyses for the authenticated user |

---

## Database Schema

### User
```
firstName, lastName, email (unique, lowercase), passwordHash (bcrypt, select:false)
role (enum), institution, isActive (default: true)
timestamps
```

### Scan
```
userId (ref: User), scanId (unique), originalFilename, fileFormat, fileSizeBytes
storagePath (Supabase path), publicUrl (Supabase HTTPS URL)
hasPatient (bool), patient { fullName, age, gender, patientId, notes }
status (enum: pending | processing | complete | failed)
analysisId (ref: Analysis), gradCamEnabled, processedAt
reportEnabled, reportPath, reportUrl, reportGeneratedAt
timestamps
```

### Analysis
```
scanId (ref: Scan, unique), userId (ref: User)
predictedClass (enum: NonDemented | VeryMildDemented | MildDemented | ModerateDemented)
confidence (0–1), probabilities { NonDemented, VeryMildDemented, MildDemented, ModerateDemented }
gradCamPath, gradCamUrl, rawResponse
timestamps
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description | Example |
|---|---|---|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment | `development` |
| `MONGO_URI` | MongoDB Atlas connection string | `mongodb+srv://...` |
| `JWT_ACCESS_SECRET` | 64-char random hex | `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `JWT_REFRESH_SECRET` | Different 64-char random hex | same command |
| `JWT_ACCESS_EXPIRES` | Access token lifetime | `15m` |
| `JWT_REFRESH_EXPIRES` | Refresh token lifetime | `7d` |
| `CLIENT_URL` | Frontend origin for CORS | `http://localhost:5173` |
| `SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Supabase service_role key | from Supabase dashboard |
| `SUPABASE_BUCKET` | Storage bucket name | `mri-scans` |
| `ML_SERVICE_URL` | FastAPI ML service base URL | `http://localhost:8000` |
| `GEMINI_API_KEY` | Google Gemini API key | from aistudio.google.com |
| `GEMINI_MODEL` | Gemini model name | `gemini-2.5-flash` |



---

## Getting Started

### Prerequisites

- Node.js 20+
- MongoDB Atlas account (free M0 tier)
- Supabase account (free tier)
- Google Gemini API key (free — aistudio.google.com)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/neurovision.git
cd neurovision/backend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your values

# Start development server (with auto-restart)
npm run dev

# Start production server
npm start
```

### Supabase Setup

1. Create a project at supabase.com
2. Go to **Storage** → Create bucket named `mri-scans` → set to **Public**
3. Go to **Settings → API** → copy the `service_role` key into `.env`

### Available Scripts

```bash
npm start          # Start server (production)
npm run dev        # Start with nodemon (development)
npm test           # Run all tests with coverage
npm run test:unit  # Unit tests only
npm run test:int   # Integration tests only
```

---

## Testing

The test suite covers **automated test cases** across five categories using **Jest 29**, **Supertest**, and **mongodb-memory-server** (no real database required).

> ⚠️ **Important**: Always run tests with `NODE_ENV=test` set. Tests use an in-memory MongoDB that is automatically isolated from your production database.

```bash
# Run all tests
npm test

# Run specific categories
npm run test:unit   # models + middleware + services
npm run test:int    # integration tests (all API routes)

# Generate HTML coverage report
npm run test:cover
# Open coverage/index.html in your browser
```

### Test categories

| Category | File | Cases | What it tests |
|---|---|---|---|
| Unit — User model | `unit/user.model.test.js` | 15 | Schema validation, bcrypt hook, toJSON |
| Unit — Scan/Analysis models | `unit/scan.analysis.model.test.js` | 18 | Enums, unique constraints, field ranges |
| Unit — Auth middleware | `unit/auth.middleware.test.js` | 9 | JWT verify, expired, deactivated, query param |
| Unit — ML service | `unit/services/mlService.test.js` | 14 | Label mapping, Grad-CAM, probability normalise |
| Unit — Analysis service | `unit/services/analysisService.test.js` | 12 | CRUD, buildContext() all fields |
| Integration — Auth | `integration/auth.routes.test.js` | 18 | Register, login, refresh, cookie |
| Integration — Scans | `integration/scan.routes.test.js` | 21 | Upload, analyse, list, delete, report |
| Integration — Users | `integration/user.routes.test.js` | 16 | Profile, password, stats, deletion |
| Black-box/Security | `integration/security.blackbox.test.js` | 19 | NoSQL injection, JWT alg:none, data isolation |


---

## Deployment

The backend is deployed on **Render** (free/starter web service).

1. Push code to GitHub
2. Create a new **Web Service** on render.com
3. Set **Root Directory** to `backend`
4. Set **Build Command** to `npm install`
5. Set **Start Command** to `node server.js`
6. Add all environment variables from the table above
7. Set `CLIENT_URL` to your GitHub Pages frontend URL


