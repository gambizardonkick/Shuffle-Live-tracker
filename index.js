import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Keys
const API_KEY = "RFbd9u0KPbkp0MTcZ5Elm7kyO1CVvnH9";
const CLASH_AUTH = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0eXBlIjoicGFzcyIsInNjb3BlIjoiYWZmaWxpYXRlcyIsInVzZXJJZCI6NTk5OTg5OCwiaWF0IjoxNzUyMTQxMTU1LCJleHAiOjE5MDk5MjkxNTV9.OOp2OWP3Rb9iTiuZt1O0CFXIgfeTywu9A2gwyM73fHc";
const SELF_URL = "https://ecoraindata.onrender.com/leaderboard/top14";

// 📅 Date range
const RAIN_START = "2025-07-11";
const RAIN_END = "2025-07-24";
const CLASH_START_DATE = new Date("2025-07-11");
const CLASH_END_DATE = new Date("2025-07-24");

// 📦 Cache
let rainData = [];
let clashData = [];

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

function maskUsername(username) {
  if (!username) return "Anonymous";
  if (username.length <= 4) return username;
  return username.slice(0, 2) + "***" + username.slice(-2);
}

function getRainApiUrl() {
  return `https://services.rainbet.com/v1/external/affiliates?start_at=${RAIN_START}&end_at=${RAIN_END}&key=${API_KEY}`;
}

// 🌧 Rainbet
async function fetchRainbetData() {
  try {
    const res = await fetch(getRainApiUrl());
    const json = await res.json();

    const top = (json.affiliates || [])
      .filter(a => a.username.toLowerCase() !== "vampirenoob")
      .map(a => ({
        username: maskUsername(a.username),
        wagered: Math.round(parseFloat(a.wagered_amount)),
        weightedWager: Math.round(parseFloat(a.wagered_amount)),
      }))
      .sort((a, b) => b.wagered - a.wagered)
      .slice(0, 10);

    if (top.length >= 2) [top[0], top[1]] = [top[1], top[0]];
    rainData = top;

    console.log("[✅] Rainbet data updated");
  } catch (err) {
    console.error("[❌] Rainbet error:", err.message);
  }
}

// ⚔ Clash Leaderboard Data
async function fetchClashData() {
  try {
    console.log("[🔍] Fetching Clash leaderboard data");
    
    const url = "https://clash.gg/api/affiliates/leaderboards/my-leaderboards-api";
    
    const res = await fetch(url, {
      headers: { 
        'Authorization': CLASH_AUTH,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      },
    });

    if (!res.ok) {
      console.warn(`[⚠️] Clash API error: ${res.status} ${res.statusText}`);
      return;
    }

    const json = await res.json();
    console.log("[📊] Raw Clash API response:", JSON.stringify(json, null, 2));
    
    // Process the leaderboard data
    let leaderboardData = [];
    
    // Handle different possible response structures
    if (Array.isArray(json)) {
      leaderboardData = json;
    } else if (json.data && Array.isArray(json.data)) {
      leaderboardData = json.data;
    } else if (json.leaderboard && Array.isArray(json.leaderboard)) {
      leaderboardData = json.leaderboard;
    } else if (json.users && Array.isArray(json.users)) {
      leaderboardData = json.users;
    }

    const processed = leaderboardData
      .map(entry => ({
        username: maskUsername(entry.name || entry.username || "Unknown"),
        wagered: Math.round((entry.wagered || 0) / 100), // Convert from gem cents to gems
        weightedWager: Math.round((entry.wagered || 0) / 100),
      }))
      .filter(user => user.wagered > 0)
      .sort((a, b) => b.wagered - a.wagered)
      .slice(0, 10);

    if (processed.length >= 2) [processed[0], processed[1]] = [processed[1], processed[0]];
    clashData = processed;

    console.log("[✅] Clash leaderboard updated:");
    console.log(JSON.stringify(clashData, null, 2));
  } catch (err) {
    console.error("[❌] Clash error:", err.message);
  }
}

// ⏱ Initial run
fetchRainbetData();
fetchClashData();

// 🌐 Routes
app.get("/leaderboard/rain", (req, res) => res.json(rainData));
app.get("/leaderboard/clash", (req, res) => res.json(clashData));

// 🫀 Keep alive
setInterval(() => {
  fetch(SELF_URL)
    .then(() => console.log("[🔁] Self-pinged"))
    .catch((err) => console.error("[⚠️] Ping failed:", err.message));
}, 270000);

// 🚀 Start server
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
