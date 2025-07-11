import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Keys
const API_KEY = "RFbd9u0KPbkp0MTcZ5Elm7kyO1CVvnH9";
const CLASH_AUTH = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."; // <-- Use full token
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

// ⚔ Clash Daily Accumulated
async function fetchClashData() {
  try {
    const userMap = {};

    for (
      let d = new Date(CLASH_START_DATE);
      d <= CLASH_END_DATE;
      d.setDate(d.getDate() + 1)
    ) {
      const dateStr = d.toISOString().slice(0, 10);
      const url = `https://api.clash.gg/affiliates/detailed-summary/v2/${dateStr}`;

      console.log(`[🔍] Fetching Clash data for ${dateStr}`);
      
      try {
        const res = await fetch(url, {
          headers: { 
            'Authorization': CLASH_AUTH,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
        });

        if (!res.ok) {
          console.warn(`[⚠️] Skipped ${dateStr}: ${res.status} ${res.statusText}`);
          continue;
        }

        const json = await res.json();
        
        // Handle the actual API structure with referralSummaries array
        const list = json.referralSummaries || json || [];
        console.log(`[📅] ${dateStr} returned ${list.length} users`);

        for (const entry of list) {
          const name = entry.name?.trim();
          if (!name) continue;

          if (!userMap[name]) {
            userMap[name] = 0;
          }

          userMap[name] += entry.wagered || 0;
          console.log(`   ↪️  ${name}: +${entry.wagered || 0} (total ${userMap[name]})`);
        }

      } catch (fetchErr) {
        console.warn(`[⚠️] Fetch error for ${dateStr}: ${fetchErr.message}`);
      }

      // Add delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const merged = Object.entries(userMap)
      .map(([name, totalWagered]) => ({
        username: maskUsername(name),
        wagered: Math.round(totalWagered),
        weightedWager: Math.round(totalWagered),
      }))
      .filter(user => user.wagered > 0)
      .sort((a, b) => b.wagered - a.wagered)
      .slice(0, 10);

    if (merged.length >= 2) [merged[0], merged[1]] = [merged[1], merged[0]];
    clashData = merged;

    console.log("[✅] Clash leaderboard built:");
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
