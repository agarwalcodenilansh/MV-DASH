# MVIKAS Live Dashboard — Setup Guide

## How it works
You update Google Sheet → Python backend fetches it → Dashboard auto-refreshes every 5 min.
No manual file uploads. No script.js rebuilds. Ever.

---

## Step 1 — Make your Google Sheet public (read-only)

1. Open your Google Sheet
2. Click **Share** (top right)
3. Change to **"Anyone with the link → Viewer"**
4. Copy the Sheet ID from the URL:
   `https://docs.google.com/spreadsheets/d/**SHEET_ID**/edit`

---

## Step 2 — Get your Sheet Tab GIDs

Each tab has a GID in the URL when you click it: `?gid=XXXXXXXX`

Open each tab and note the GID:

| Tab name                | GID |
|------------------------|-----|
| Yesterday Booking / Shipment Booked Yesterday | ? |
| Daily Tonnage          | ?   |
| Total_Tonnage_this_Month | ?  |
| Tonnage_of_June_Month  | ?   |
| Order_Due_Tommorow     | ?   |
| Order_EDD_Crossed      | ?   |
| Open_Shipment          | ?   |

---

## Step 3 — Deploy the backend (free on Render)

1. Create a free account at **render.com**
2. New → **Web Service** → Connect your GitHub repo
   (push this folder to GitHub first)
3. Set:
   - **Build command**: `pip install -r requirements.txt`
   - **Start command**: `gunicorn app:app`
4. Add **Environment Variables**:
   ```
   SHEET_ID   = your-sheet-id
   GID_BOOKED = 0        ← replace with real GIDs
   GID_DAILY  = 1
   GID_MONTHLY= 2
   GID_JUNE   = 3
   GID_DUE    = 4
   GID_EDD    = 5
   GID_OPEN   = 6
   ```
5. Deploy → copy your app URL e.g. `https://mvikas-dashboard.onrender.com`

---

## Step 4 — Update index.html

Open `index.html` and find this line:
```js
window.DASHBOARD_API_URL = "https://YOUR-APP-NAME.onrender.com/api/dashboard-data";
```
Replace with your actual Render URL.

Push `index.html` + `script.js` + `style.css` to your GitHub Pages repo.

---

## Step 5 — Test

Visit: `https://YOUR-APP-NAME.onrender.com/api/dashboard-data`

You should see a JSON response with all dashboard data.
Then open your GitHub Pages site — it will auto-fetch and render.

---

## Local development

```bash
pip install -r requirements.txt
cp .env.example .env   # fill in your values
python app.py
```
Then in index.html change API_URL to `http://localhost:5000/api/dashboard-data`

---

## Refresh interval
Dashboard auto-refreshes every **5 minutes**.
To change it, edit this line in `script.js`:
```js
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
```

---

## Free tier notes
- Render free tier **spins down** after 15 min of inactivity (first request takes ~30s to wake)
- Upgrade to Render Starter ($7/mo) for always-on
- Alternatively deploy to **Railway**, **PythonAnywhere**, or **Fly.io**
