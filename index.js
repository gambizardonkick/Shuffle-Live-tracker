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

// ⚔ Clash Daily Accumulated with Puppeteer
async function fetchClashData() {
  try {
    const puppeteer = await import('puppeteer');
    const userMap = {};

    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    for (
      let d = new Date(CLASH_START_DATE);
      d <= CLASH_END_DATE;
      d.setDate(d.getDate() + 1)
    ) {
      const dateStr = d.toISOString().slice(0, 10);
      const url = `https://api.clash.gg/affiliates/detailed-summary/v2/${dateStr}`;

      console.log(`[🔍] Fetching Clash data for ${dateStr} with Puppeteer`);
      
      const page = await browser.newPage();
      
      // Set authorization header
      await page.setExtraHTTPHeaders({
        'Authorization': CLASH_AUTH
      });

      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Wait for content to load and check if we got JSON
        const content = await page.content();
        
        if (content.includes('challenge-platform')) {
          console.warn(`[⚠️] Cloudflare challenge detected for ${dateStr}`);
          await page.close();
          continue;
        }

        // Try to get JSON from the page
        const jsonText = await page.evaluate(() => {
          const pre = document.querySelector('pre');
          if (pre) return pre.textContent;
          return document.body.textContent;
        });

        let json;
        try {
          json = JSON.parse(jsonText);
        } catch (parseErr) {
          console.warn(`[⚠️] Failed to parse JSON for ${dateStr}`);
          await page.close();
          continue;
        }

        const list = json.referralSummaries || [];
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

      } catch (pageErr) {
        console.warn(`[⚠️] Page error for ${dateStr}: ${pageErr.message}`);
      }

      await page.close();
      // Add delay between requests
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    await browser.close();

    const merged = Object.entries(userMap)
      .map(([name, totalCents]) => {
        const wager = Math.floor(totalCents / 100);
        return {
          username: maskUsername(name),
          wagered: wager,
          weightedWager: wager,
        };
      })
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
