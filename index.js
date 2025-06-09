import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

const API_URL = "https://services.rainbet.com/v1/external/affiliates?start_at=2025-05-11&end_at=2025-06-10&key=yJXEBkgryTtlOSo2OrgxjtdgwNNOvScO";
const SELF_URL = "https://typlerplaysdata.onrender.com/leaderboard/top14";

let cachedData = [];

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

function maskUsername(username) {
  if (username.length <= 4) return username;
  return username.slice(0, 2) + "***" + username.slice(-2);
}

async function fetchAndCacheData() {
  try {
    const response = await fetch(API_URL);
    const json = await response.json();
    if (!json.affiliates) throw new Error("No data");

    // Remove TYLERGOAT11
    const filtered = json.affiliates.filter(entry => entry.username !== "TYLERGOAT11");

    // Get top 10
    const sorted = filtered.sort((a, b) => parseFloat(b.wagered_amount) - parseFloat(a.wagered_amount));
    const top10 = sorted.slice(0, 10);

    // Add $200 to 10th person's wagered amount
    const bonusAmount = 200;
    const modified10th = {
      ...top10[9],
      wagered_amount: (parseFloat(top10[9].wagered_amount) + bonusAmount).toString()
    };

    // Construct TYLERGOAT11 entry
    const tylerWagered = parseFloat(modified10th.wagered_amount);
    const tylerEntry = {
      username: "TYLERGOAT11",
      wagered_amount: tylerWagered.toString()
    };

    // Replace 10th person with modified, and insert TYLERGOAT11 at top
    const finalList = [tylerEntry, ...top10.slice(0, 9), modified10th];

    cachedData = finalList.map(entry => ({
      username: entry.username === "TYLERGOAT11" ? maskUsername(entry.username) : maskUsername(entry.username),
      wagered: Math.round(parseFloat(entry.wagered_amount)),
      weightedWager: Math.round(parseFloat(entry.wagered_amount))
    }));

    console.log(`[✅] Leaderboard updated with TYLERGOAT11 at top`);
  } catch (err) {
    console.error("[❌] Failed to fetch Rainbet data:", err.message);
  }
}

fetchAndCacheData();
setInterval(fetchAndCacheData, 5 * 60 * 1000);

app.get("/leaderboard/top14", (req, res) => {
  res.json(cachedData);
});

setInterval(() => {
  fetch(SELF_URL)
    .then(() => console.log(`[🔁] Self-pinged ${SELF_URL}`))
    .catch(err => console.error("[⚠️] Self-ping failed:", err.message));
}, 270000);

app.listen(PORT, () => console.log(`🚀 Running on port ${PORT}`));
