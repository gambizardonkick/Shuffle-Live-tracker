import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;
const SELF_URL = "https://colebeardata.onrender.com/leaderboard/top14";
const API_KEY = "k4j4j3Yk7e9BePgYg2cAmlsUC8WGNC5f";

let cachedData = [];

// ====== CYCLE CONFIG (UTC) ======
const BASE_START_MS = Date.UTC(2025, 7, 11, 0, 0, 0); // 11 Aug 2025 00:00:00 UTC
const CYCLE_MS = 14 * 24 * 60 * 60 * 1000;           // 14 days

// ✅ CORS headers manually (unchanged)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// ---------- helpers (unchanged behavior except date window) ----------
function maskUsername(username = "") {
  if (username.length <= 4) return username;
  return username.slice(0, 2) + "***" + username.slice(-2);
}
function ymdUTC(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function cycleIndex(nowMs) {
  return Math.floor((nowMs - BASE_START_MS) / CYCLE_MS);
}
/** Get start/end Date objects for cycle offset from NOW (UTC) */
function getCycleBounds(offset = 0, nowMs = Date.now()) {
  const k0 = cycleIndex(nowMs);
  const k = k0 + offset; // can be negative (before first cycle)
  const startMs = BASE_START_MS + k * CYCLE_MS;
  const endMs = startMs + CYCLE_MS - 1; // inclusive
  return { startDate: new Date(startMs), endDate: new Date(endMs), k };
}

// ====== ONLY THIS CHANGED: build the current-cycle URL instead of month ======
function getDynamicApiUrl() {
  const nowMs = Date.now(); // UTC epoch ms
  const { startDate, endDate, k } = getCycleBounds(0, nowMs);

  // If we haven't reached the first cycle yet → return a harmless URL
  if (k < 0) {
    const s = new Date(BASE_START_MS);
    console.log(`[ℹ] Before first cycle. Will use empty window around ${ymdUTC(s)}.`);
  }

  const startStr = ymdUTC(startDate);
  const endStr = ymdUTC(endDate);
  const url = `https://services.rainbet.com/v1/external/affiliates?start_at=${startStr}&end_at=${endStr}&key=${API_KEY}`;
  console.log(`[➡️] TOP14 URL: ${url}`);
  return url;
}

async function fetchAndCacheData() {
  try {
    const response = await fetch(getDynamicApiUrl());
    const json = await response.json();
    if (!json.affiliates) throw new Error("No data");

    const sorted = json.affiliates.sort(
      (a, b) => parseFloat(b.wagered_amount) - parseFloat(a.wagered_amount)
    );

    const top10 = sorted.slice(0, 10);
    if (top10.length >= 2) [top10[0], top10[1]] = [top10[1], top10[0]];

    cachedData = top10.map(entry => ({
      username: maskUsername(entry.username),
      wagered: Math.round(parseFloat(entry.wagered_amount)),
      weightedWager: Math.round(parseFloat(entry.wagered_amount)),
    }));

    console.log(`[✅] Leaderboard updated`);
  } catch (err) {
    console.error("[❌] Failed to fetch Rainbet data:", err.message);
    // keep last good cache
  }
}

fetchAndCacheData();
setInterval(fetchAndCacheData, 5 * 60 * 1000); // every 5 minutes

// ---------- routes (same responses; only the /prev window changed) ----------
app.get("/leaderboard/top14", (req, res) => {
  res.json(cachedData);
});

app.get("/leaderboard/prev", async (req, res) => {
  try {
    const nowMs = Date.now();
    const { startDate, endDate, k } = getCycleBounds(-1, nowMs);

    // If previous cycle ends before the base start → no data yet
    if (endDate.getTime() < BASE_START_MS) {
      console.log("[↩] PREV: before base start → []");
      return res.json([]);
    }

    const startStr = ymdUTC(startDate);
    const endStr = ymdUTC(endDate);
    const url = `https://services.rainbet.com/v1/external/affiliates?start_at=${startStr}&end_at=${endStr}&key=${API_KEY}`;
    console.log(`[↩] PREV URL: ${url}`);

    const response = await fetch(url);
    const json = await response.json();

    if (!json.affiliates) throw new Error("No previous data");

    const sorted = json.affiliates.sort(
      (a, b) => parseFloat(b.wagered_amount) - parseFloat(a.wagered_amount)
    );

    const top10 = sorted.slice(0, 10);
    if (top10.length >= 2) [top10[0], top10[1]] = [top10[1], top10[0]];

    const processed = top10.map(entry => ({
      username: maskUsername(entry.username),
      wagered: Math.round(parseFloat(entry.wagered_amount)),
      weightedWager: Math.round(parseFloat(entry.wagered_amount)),
    }));

    res.json(processed);
  } catch (err) {
    console.error("[❌] Failed to fetch previous leaderboard:", err.message);
    res.status(500).json({ error: "Failed to fetch previous leaderboard data." });
  }
});

// ---------- keep-alive (unchanged) ----------
setInterval(() => {
  fetch(SELF_URL)
    .then(() => console.log(`[🔁] Self-pinged ${SELF_URL}`))
    .catch(err => console.error("[⚠️] Self-ping failed:", err.message));
}, 270000); // every 4.5 mins

app.listen(PORT, () => console.log(`🚀 Running on port ${PORT}`));