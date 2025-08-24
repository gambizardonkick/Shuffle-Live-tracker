
import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;
const SELF_URL = "https://colebeardata.onrender.com/leaderboard/top14";
const API_KEY = "k4j4j3Yk7e9BePgYg2cAmlsUC8WGNC5f";

let cachedData = [];

// Simple 2-week periods starting from Aug 11, 2025
const PERIOD_START = new Date('2025-08-11T00:00:00Z');
const PERIOD_DAYS = 14;

function getCurrentPeriod() {
  const now = new Date();
  const daysSinceStart = Math.floor((now - PERIOD_START) / (1000 * 60 * 60 * 24));
  const periodNumber = Math.floor(daysSinceStart / PERIOD_DAYS);
  
  const currentStart = new Date(PERIOD_START);
  currentStart.setUTCDate(currentStart.getUTCDate() + (periodNumber * PERIOD_DAYS));
  
  const currentEnd = new Date(currentStart);
  currentEnd.setUTCDate(currentEnd.getUTCDate() + PERIOD_DAYS - 1);
  
  return {
    start: currentStart.toISOString().split('T')[0],
    end: currentEnd.toISOString().split('T')[0]
  };
}

function getPreviousPeriod() {
  const now = new Date();
  const daysSinceStart = Math.floor((now - PERIOD_START) / (1000 * 60 * 60 * 24));
  const periodNumber = Math.floor(daysSinceStart / PERIOD_DAYS);
  
  const prevStart = new Date(PERIOD_START);
  prevStart.setUTCDate(prevStart.getUTCDate() + ((periodNumber - 1) * PERIOD_DAYS));
  
  const prevEnd = new Date(prevStart);
  prevEnd.setUTCDate(prevEnd.getUTCDate() + PERIOD_DAYS - 1);
  
  return {
    start: prevStart.toISOString().split('T')[0],
    end: prevEnd.toISOString().split('T')[0]
  };
}

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

function maskUsername(username = "") {
  if (username.length <= 4) return username;
  return username.slice(0, 2) + "***" + username.slice(-2);
}

async function fetchAndCacheData() {
  try {
    const period = getCurrentPeriod();
    const url = `https://services.rainbet.com/v1/external/affiliates?start_at=${period.start}&end_at=${period.end}&key=${API_KEY}`;
    console.log(`[Current] ${period.start} to ${period.end}`);
    
    const response = await fetch(url);
    const json = await response.json();
    
    if (!json.affiliates) {
      console.log("[❌] No affiliates data");
      return;
    }

    const sorted = json.affiliates.sort(
      (a, b) => parseFloat(b.wagered_amount) - parseFloat(a.wagered_amount)
    );

    const top10 = sorted.slice(0, 10);
    if (top10.length >= 2) {
      [top10[0], top10[1]] = [top10[1], top10[0]];
    }

    cachedData = top10.map(entry => ({
      username: maskUsername(entry.username),
      wagered: Math.round(parseFloat(entry.wagered_amount)),
      weightedWager: Math.round(parseFloat(entry.wagered_amount)),
    }));

    console.log(`[✅] Updated: ${cachedData.length} entries`);
  } catch (err) {
    console.error("[❌] Fetch failed:", err.message);
  }
}

app.get("/leaderboard/top14", (req, res) => {
  res.json(cachedData);
});

app.get("/leaderboard/prev", async (req, res) => {
  try {
    const period = getPreviousPeriod();
    const url = `https://services.rainbet.com/v1/external/affiliates?start_at=${period.start}&end_at=${period.end}&key=${API_KEY}`;
    console.log(`[Previous] ${period.start} to ${period.end}`);

    const response = await fetch(url);
    const json = await response.json();

    if (!json.affiliates) {
      return res.json([]);
    }

    const sorted = json.affiliates.sort(
      (a, b) => parseFloat(b.wagered_amount) - parseFloat(a.wagered_amount)
    );

    const top10 = sorted.slice(0, 10);
    if (top10.length >= 2) {
      [top10[0], top10[1]] = [top10[1], top10[0]];
    }

    const processed = top10.map(entry => ({
      username: maskUsername(entry.username),
      wagered: Math.round(parseFloat(entry.wagered_amount)),
      weightedWager: Math.round(parseFloat(entry.wagered_amount)),
    }));

    res.json(processed);
  } catch (err) {
    console.error("[❌] Previous fetch failed:", err.message);
    res.status(500).json({ error: "Failed to fetch previous data" });
  }
});

setInterval(() => {
  fetch(SELF_URL)
    .then(() => console.log(`[🔁] Self-ping OK`))
    .catch(err => console.error("[⚠️] Self-ping failed:", err.message));
}, 270000);

fetchAndCacheData();
setInterval(fetchAndCacheData, 5 * 60 * 1000);

app.listen(PORT, () => console.log(`🚀 Running on port ${PORT}`));
