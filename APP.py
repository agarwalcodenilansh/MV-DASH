from flask import Flask, jsonify
from flask_cors import CORS
import pandas as pd
import requests
from io import StringIO
from collections import defaultdict
from datetime import datetime, date
import os

app = Flask(__name__)
CORS(app)

# ─── CONFIG ──────────────────────────────────────────────────────────────────
# Your Google Sheet ID (from the URL)
SHEET_ID = os.environ.get("SHEET_ID", "1Dn5k_NcXti_u0NJ6L0BsTssiCBkVHCXzVjxtmccL7Hs")

# Sheet GIDs — get these from your Google Sheet tab URLs (?gid=XXXXX)
# Update these to match your actual tab GIDs
SHEET_TABS = {
    "booked":   os.environ.get("GID_BOOKED",   "0"),
    "daily":    os.environ.get("GID_DAILY",     "1"),
    "monthly":  os.environ.get("GID_MONTHLY",   "2"),
    "june":     os.environ.get("GID_JUNE",      "3"),
    "due":      os.environ.get("GID_DUE",       "4"),
    "edd":      os.environ.get("GID_EDD",       "5"),
    "open":     os.environ.get("GID_OPEN",      "6"),
}

def csv_url(gid):
    return f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={gid}"

def fetch_sheet(gid, skip_rows=0):
    """Fetch a Google Sheet tab as a DataFrame."""
    url = csv_url(gid)
    resp = requests.get(url, timeout=15)
    resp.raise_for_status()
    df = pd.read_csv(StringIO(resp.text), skiprows=skip_rows, on_bad_lines="skip")
    df.columns = [str(c).strip() for c in df.columns]
    return df

def is_sunday():
    return date.today().weekday() == 6  # 6 = Sunday

def count_by_customer(df, customer_col="Customername", dedupe_col=None):
    """Count rows per customer, optionally deduplicating by a column first."""
    df = df.dropna(subset=[customer_col])
    df[customer_col] = df[customer_col].astype(str).str.strip()
    if dedupe_col and dedupe_col in df.columns:
        df = df.drop_duplicates(subset=[dedupe_col])
    counts = df.groupby(customer_col).size().reset_index(name="count")
    return counts.sort_values("count", ascending=False).to_dict(orient="records")

def safe_float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0

# ─── MAIN DATA PROCESSOR ─────────────────────────────────────────────────────
def process_dashboard():
    today = datetime.today()
    day_of_month = today.day
    month_name = today.strftime("%B %Y")
    days_in_month = pd.Period(today.strftime("%Y-%m")).days_in_month
    report_date = today.strftime("%B %-d, %Y")  # e.g. "June 10, 2026"
    yesterday = (today - pd.Timedelta(days=1)).strftime("%B %-d, %Y")
    tomorrow  = (today + pd.Timedelta(days=1)).strftime("%B %-d")

    sunday = is_sunday()

    # ── 1. OPEN SHIPMENTS ────────────────────────────────────────────────────
    df_open = fetch_sheet(SHEET_TABS["open"])
    open_data = count_by_customer(df_open)
    open_total = sum(r["count"] for r in open_data)

    # ── 2. EDD CROSSED ───────────────────────────────────────────────────────
    df_edd = fetch_sheet(SHEET_TABS["edd"])
    edd_data = count_by_customer(df_edd)
    edd_total = sum(r["count"] for r in edd_data)

    # ── 3. DUE TOMORROW ──────────────────────────────────────────────────────
    df_due = fetch_sheet(SHEET_TABS["due"])
    due_col = next((c for c in df_due.columns if "order" in c.lower() and "id" in c.lower()), None)
    due_data = count_by_customer(df_due, dedupe_col=due_col)
    due_total = sum(r["count"] for r in due_data)

    # ── 4. BOOKED YESTERDAY ──────────────────────────────────────────────────
    if sunday:
        booked_data, booked_total = [], 0
    else:
        df_booked = fetch_sheet(SHEET_TABS["booked"])
        # Check for SUNDAY marker
        flat = df_booked.to_string()
        if "SUNDAY" in flat.upper():
            booked_data, booked_total = [], 0
        else:
            booked_data = count_by_customer(df_booked)
            booked_total = sum(r["count"] for r in booked_data)

    # ── 5. DAILY TONNAGE ─────────────────────────────────────────────────────
    if sunday:
        daily_data, daily_total = [], 0
    else:
        df_daily = fetch_sheet(SHEET_TABS["daily"])
        flat = df_daily.to_string()
        if "SUNDAY" in flat.upper():
            daily_data, daily_total = [], 0
        else:
            # Expect: col0=customer, col1=kg
            df_daily = df_daily.dropna(subset=[df_daily.columns[0], df_daily.columns[1]])
            df_daily["kg"] = df_daily.iloc[:, 1].apply(safe_float)
            df_daily["name"] = df_daily.iloc[:, 0].astype(str).str.strip()
            df_daily = df_daily[df_daily["kg"] > 0].sort_values("kg", ascending=False)
            daily_data  = df_daily[["name", "kg"]].to_dict(orient="records")
            daily_total = round(df_daily["kg"].sum(), 2)

    # ── 6. MONTHLY TONNAGE ───────────────────────────────────────────────────
    df_monthly = fetch_sheet(SHEET_TABS["monthly"])
    df_monthly = df_monthly.dropna(subset=[df_monthly.columns[0], df_monthly.columns[1]])
    df_monthly["kg"] = df_monthly.iloc[:, 1].apply(safe_float)
    monthly_total = round(df_monthly["kg"].sum(), 2)

    # ── 7. JUNE/CURRENT MONTH — CLIENTS + KAM ────────────────────────────────
    # Row 0 = merged header (skip), Row 1 = actual headers
    df_june_raw = fetch_sheet(SHEET_TABS["june"], skip_rows=1)
    # Expected cols: S No | Name of the personnel | Designation | Name of the customer | Monthly Target | date1 | date2 ...
    clients = []
    for _, row in df_june_raw.iterrows():
        client = str(row.iloc[3]).strip() if pd.notna(row.iloc[3]) else ""
        kam    = str(row.iloc[1]).strip() if pd.notna(row.iloc[1]) else ""
        if not client or client.lower() in ("nan", "name of the customer"):
            continue
        target_raw = row.iloc[4]
        target = safe_float(target_raw) if str(target_raw).strip().upper() != "TBD" else 0

        daily_vals = [safe_float(v) for v in row.iloc[5:] if pd.notna(v) and safe_float(v) > 0]
        achieved   = round(sum(daily_vals), 2)
        active_days = len(daily_vals)
        avg_day = round(achieved / active_days) if active_days > 0 else 0
        pct     = round(achieved / target * 100) if target > 0 else (999 if achieved > 0 else 0)
        remaining  = max(target - achieved, 0)
        days_needed = round(remaining / avg_day, 1) if avg_day > 0 and remaining > 0 else (0 if remaining == 0 else 999)

        clients.append({
            "name":       client,
            "person":     kam,
            "target":     target,
            "achieved":   achieved,
            "activeDays": active_days,
            "avgDay":     avg_day,
            "pct":        pct,
            "remaining":  remaining,
            "daysNeeded": days_needed,
        })

    monthly_total_clients = round(sum(c["achieved"] for c in clients), 2)
    active_days_elapsed   = max((c["activeDays"] for c in clients), default=1)
    daily_avg = round(monthly_total_clients / active_days_elapsed) if active_days_elapsed > 0 else 0

    # ── KAM rollup ────────────────────────────────────────────────────────────
    kam_map = defaultdict(lambda: {"person": "", "totalTarget": 0, "totalAchieved": 0, "clients": []})
    for c in clients:
        if c["achieved"] > 0:
            k = kam_map[c["person"]]
            k["person"]        = c["person"]
            k["totalTarget"]  += c["target"]
            k["totalAchieved"] += c["achieved"]
            k["clients"].append(c["name"])
    kam_list = sorted(kam_map.values(), key=lambda x: -x["totalAchieved"])

    # ── BUILD RESPONSE ────────────────────────────────────────────────────────
    return {
        "meta": {
            "reportDate":        report_date,
            "yesterday":         yesterday,
            "tomorrow":          tomorrow,
            "monthLabel":        month_name,
            "dayOfMonth":        day_of_month,
            "daysInMonth":       int(days_in_month),
            "activeDaysElapsed": int(active_days_elapsed),
            "isSunday":          sunday,
        },
        "kpis": {
            "openTotal":    open_total,
            "eddTotal":     edd_total,
            "eddPct":       round(edd_total / open_total * 100) if open_total else 0,
            "dueTotal":     due_total,
            "bookedTotal":  booked_total,
            "dailyTotal":   daily_total,
            "monthlyTotal": monthly_total_clients,
            "dailyAvg":     daily_avg,
        },
        "openData":   open_data,
        "eddData":    edd_data,
        "dueData":    due_data,
        "bookedData": booked_data,
        "dailyData":  daily_data,
        "clients":    clients,
        "kamList":    [dict(k) for k in kam_list],
    }

# ─── ROUTES ──────────────────────────────────────────────────────────────────
@app.route("/api/dashboard-data")
def dashboard_data():
    try:
        data = process_dashboard()
        return jsonify({"status": "ok", "data": data})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "timestamp": datetime.utcnow().isoformat()})

@app.route("/")
def index():
    return "<h3>MVIKAS Dashboard API is running. See <a href='/api/dashboard-data'>/api/dashboard-data</a></h3>"

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)