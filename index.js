const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());

const apiUrl = "https://roobetconnect.com/affiliate/v2/stats";
const apiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjI2YWU0ODdiLTU3MDYtNGE3ZS04YTY5LTMzYThhOWM5NjMxYiIsIm5vbmNlIjoiZWI2MzYyMWUtMTMwZi00ZTE0LTlmOWMtOTY3MGNiZGFmN2RiIiwic2VydmljZSI6ImFmZmlsaWF0ZVN0YXRzIiwiaWF0IjoxNzI3MjQ2NjY1fQ.rVG_QKMcycBEnzIFiAQuixfu6K_oEkAq2Y8Gukco3b8";
const userId = "26ae487b-5706-4a7e-8a69-33a8a9c9631b";

let leaderboardCache = [];
let leaderboardTop14Cache = [];

const formatUsername = (username) => {
  const firstTwo = username.slice(0, 2);
  const lastTwo = username.slice(-2);
  return `${firstTwo}***${lastTwo}`;
};

// Utility to get last day of a month
function getLastDayOfMonth(year, month) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

// JST-aware monthly raffle logic with dynamic last-day fix
function getMonthlyDateRange() {
  const now = new Date();
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000); // UTC+9
  const year = jstNow.getUTCFullYear();
  const month = jstNow.getUTCMonth();

  let startDate, endDate;

  const inTwoMonthPeriod = (
    jstNow >= new Date(Date.UTC(2025, 5, 0, 15, 1, 0)) && // May 31 15:01 UTC = June 1 JST
    jstNow < new Date(Date.UTC(2025, 7, 0, 15, 0, 0))     // July 31 15:00 UTC = Aug 1 JST
  );

  if (inTwoMonthPeriod) {
    startDate = new Date(Date.UTC(2025, 4, 30, 15, 1, 0)); // May 30 15:01 UTC
    endDate = new Date(Date.UTC(2025, 6, 31, 15, 0, 0));   // July 31 15:00 UTC
  } else {
    const prevMonth = month - 1 < 0 ? 11 : month - 1;
    const prevYear = month - 1 < 0 ? year - 1 : year;
    const endOfPrevMonth = getLastDayOfMonth(prevYear, prevMonth);
    const endOfThisMonth = getLastDayOfMonth(year, month);

    startDate = new Date(Date.UTC(prevYear, prevMonth, endOfPrevMonth, 15, 1, 0));
    endDate = new Date(Date.UTC(year, month, endOfThisMonth, 15, 0, 0));
  }

  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
}

async function fetchLeaderboardData() {
  try {
    const { startDate, endDate } = getMonthlyDateRange();

    const response = await axios.get(apiUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      params: {
        userId,
        startDate,
        endDate,
      },
    });

    const data = response.data;

    const sorted = data
      .filter((player) => player.username !== "azisai205")
      .sort((a, b) => b.weightedWagered - a.weightedWagered);

    leaderboardCache = sorted.map((player, index) => ({
      rank: index + 1,
      username: player.username,
      weightedWager: Math.round(player.weightedWagered),
    }));

    leaderboardTop14Cache = sorted
      .map((player) => ({
        username: formatUsername(player.username),
        weightedWager: Math.round(player.weightedWagered),
      }));

    if (leaderboardTop14Cache.length >= 2) {
      const temp = leaderboardTop14Cache[0];
      leaderboardTop14Cache[0] = leaderboardTop14Cache[1];
      leaderboardTop14Cache[1] = temp;
    }

    console.log(`[${new Date().toISOString()}] ✅ Leaderboard updated: ${sorted.length} entries`);
  } catch (error) {
    leaderboardCache = [];
    leaderboardTop14Cache = [];
    console.error("❌ Error fetching leaderboard data:", error.message);
  }
}

// Routes
app.get("/", (req, res) => {
  res.send("🎰 Roobet Leaderboard API Live! Use /leaderboard or /leaderboard/top14");
});

app.get("/leaderboard", (req, res) => {
  res.json(leaderboardCache);
});

app.get("/leaderboard/top14", (req, res) => {
  res.json(leaderboardTop14Cache.slice(0, 14));
});

app.get("/current-range", (req, res) => {
  const { startDate, endDate } = getMonthlyDateRange();
  res.json({ startDate, endDate });
});

// Server start
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Fetch & refresh loop
fetchLeaderboardData();
setInterval(fetchLeaderboardData, 5 * 60 * 1000);

setInterval(() => {
  axios
    .get("https://azisailbdata.onrender.com/leaderboard/top14")
    .then(() => console.log("🔁 Self-ping OK"))
    .catch((err) => console.error("❌ Self-ping failed:", err.message));
}, 4 * 60 * 1000);
