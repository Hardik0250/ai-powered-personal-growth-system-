# AI-Powered Personal Growth System

A personal growth dashboard built with React (Vite), FastAPI, and SQLAlchemy. It tracks habits, goals, and journal entries, and includes an optional Gemini-powered coach.

## Daily reminders, coach chat, and Gita reflections

- Add reminders from **Reminders**. They repeat daily at the selected device-local time and are stored with the rest of the app data.
- To receive notification pop-ups and alarm sounds, enable browser notifications on the Reminders page and allow notification permission. Because alarms run in the browser, keep the app open; alarms cannot ring if the browser/app is closed or the device is asleep. Background delivery also depends on browser and operating-system notification settings.
- The **AI Coach** accepts follow-up messages and includes recent conversation turns when requesting advice. Chat history is held in the current page only and is not saved. Conversational Gemini responses require `GEMINI_API_KEY`; without it, the built-in coach provides an offline response.
- The Overview shows a Bhagavad Gita verse reference and a daily English reflection paraphrase. The reflection is not a word-for-word translation.

## Run locally

Requirements: Node.js 18+ and Python 3.10+.

Backend (from `backend`):

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn main:app --reload
```

Frontend (from `frontend`, in a second terminal):

```powershell
npm install
npm run dev
```

Open the URL printed by Vite (usually http://localhost:5173). The local backend uses SQLite by default. The API docs are at http://127.0.0.1:8000/docs.

## Deploy free online

The deployment uses Cloudflare Pages for the frontend, Render for FastAPI, and Supabase PostgreSQL for persistent data. Free plans can sleep or pause when idle; Render's free web service may take around a minute to wake. Supabase free projects may pause after a week of inactivity. The app and database remain independent of your laptop.

### 1. Put the project in a GitHub repository

Create a repository and push the contents of this project to it. Do not commit `.env` files, database files, passwords, or secret keys.

### 2. Create the database

Create a free project at [Supabase](https://supabase.com/). In the project dashboard, open **Connect** and copy a PostgreSQL connection string. Prefer the session pooler connection if the direct connection is not reachable from Render. Keep the URL private.

### 3. Create the frontend project on Cloudflare Pages

Create a Pages project from the same GitHub repository. Choose a project name and note the resulting `https://<project-name>.pages.dev` origin. Configure:

- Root directory: `frontend`
- Build command: `npm run build`
- Build output directory: `dist`

The frontend is not connected to the hosted API yet; finish the next step, then set its `VITE_API_URL` build environment variable and trigger a new Pages deployment.

### 4. Deploy the API on Render

In Render, choose **New > Blueprint**, connect your repository, and select `render.yaml`. When prompted, enter:

- `DATABASE_URL`: the Supabase PostgreSQL connection string
- `APP_PASSWORD`: a private random password with at least 16 characters
- `APP_SECRET_KEY`: a separate signing key with at least 32 characters
- `CORS_ORIGINS`: the exact Cloudflare Pages origin from step 3, without a trailing slash

Generate random values locally with Python:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Run it separately for the password and signing key. Do not use the same value for both. Keep the credentials in Render's environment settings, never in source code. The API address will look like `https://<your-render-service>.onrender.com`.

Now set `VITE_API_URL` in Cloudflare Pages to `https://<your-render-service>.onrender.com/api` and redeploy Pages. Only the configured site origin is allowed to call the API from a browser.

The app will ask for the workspace password before showing your data. Sign-in tokens expire after 12 hours and are kept in the current browser tab session.

### 5. Confirm the deployment

Open the Pages URL, sign in, and try adding a habit. Reload the page and verify it remains. If the API has been idle, its first request may take a little time while Render wakes it.

## Configuration

- `DATABASE_URL`: defaults to local SQLite; set to a PostgreSQL connection string for hosting.
- `APP_ENV`: set to `production` on the hosted backend. Production startup requires `APP_PASSWORD` and `APP_SECRET_KEY`.
- `APP_PASSWORD`: shared sign-in password; at least 16 characters in production.
- `APP_SECRET_KEY`: secret used to sign 12-hour API tokens; at least 32 characters in production.
- `CORS_ORIGINS`: comma-separated list of allowed website origins.
- `VITE_API_URL`: frontend API base URL, including `/api`.
- `GEMINI_API_KEY`: optional key for the AI coach. Without it, the app uses its built-in rule-based coach.

The hosted database starts empty; the SQLite data on your laptop is not automatically copied to Supabase.

## Academic note

The default AI coach is rule-based, not a trained machine-learning model. If Gemini is configured, coach responses use the external generative AI API.
