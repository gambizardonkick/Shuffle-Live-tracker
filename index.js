import express from "express";
import axios from "axios";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());

const apiUrl = "https://roobetconnect.com/affiliate/v2/stats";
const apiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjI2YWU0ODdiLTU3MDYtNGE3ZS04YTY5LTMzYThhOWM5NjMxYiIsIm5vbmNlIjoiZWI2MzYyMWUtMTMwZi00ZTE0LTlmOWMtOTY3MGNiZGFmN2RiIiwic2VydmljZSI6ImFmZmlsaWF0ZVN0YXRzIiwiaWF0IjoxNzI3MjQ2NjY1fQ.rVG_QKMcycBEnzIFiAQuixfu6K_oEkAq2Y8Gukco3b8";

let leaderboardCache = [];

const formatUsername = (username) => {
    const firstTwo = username.slice(0, 2);
    const lastTwo = username.slice(-2);
    return `${firstTwo}***${lastTwo}`;
};

// Get current JST weekly window (1-7, 8-14, 15-21, 22-28)
function getJST7DayPeriodWindow() {
    const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000); // UTC+9

    const year = nowJST.getUTCFullYear();
    const month = nowJST.getUTCMonth();
    const date = nowJST.getUTCDate();

    let startDay, endDay;

    if (date >= 1 && date <= 7) {
        startDay = 1;
        endDay = 7;
    } else if (date >= 8 && date <= 14) {
        startDay = 8;
        endDay = 14;
    } else if (date >= 15 && date <= 21) {
        startDay = 15;
        endDay = 21;
    } else if (date >= 22 && date <= 28) {
        startDay = 22;
        endDay = 28;
    } else {
        return null; // outside valid period
    }

    const start = new Date(Date.UTC(year, month, startDay - 1, 15, 0, 1)); // JST 00:00:01
    const end = new Date(Date.UTC(year, month, endDay, 14, 59, 59));       // JST 23:59:59

    return {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
    };
}

async function fetchLeaderboardData() {
    try {
        const period = getJST7DayPeriodWindow();
        if (!period) {
            console.log("No leaderboard active (JST 29–31).");
            leaderboardCache = [];
            return;
        }

        const { startDate, endDate } = period;

        const response = await axios.get(apiUrl, {
            headers: { Authorization: `Bearer ${apiKey}` },
            params: {
                userId: "26ae487b-5706-4a7e-8a69-33a8a9c9631b",
                startDate,
                endDate,
            },
        });

        const data = response.data;

        leaderboardCache = data
            .filter((player) => player.username !== "azisai205")
            .sort((a, b) => b.weightedWagered - a.weightedWagered)
            .map((player) => ({
                username: formatUsername(player.username),
                wagered: Math.round(player.weightedWagered),
                weightedWager: Math.round(player.weightedWagered),
            }));

        console.log(`✅ Updated leaderboard cache for ${startDate} to ${endDate}`);
    } catch (error) {
        console.error("❌ Error fetching leaderboard:", error.message);
    }
}

// Routes
app.get("/", (req, res) => {
    res.send("Welcome. Access /1000 or /5000 for this week's filtered data.");
});

app.get("/1000", (req, res) => {
    const filtered = leaderboardCache.filter((p) => p.weightedWager >= 1000);
    res.json(filtered);
});

app.get("/5000", (req, res) => {
    const filtered = leaderboardCache.filter((p) => p.weightedWager >= 5000);
    res.json(filtered);
});

// Refresh cache every 5 mins
fetchLeaderboardData();
setInterval(fetchLeaderboardData, 5 * 60 * 1000);

// Keep Render alive
setInterval(() => {
    axios.get("https://azisaiweekly-upnb.onrender.com/5000")
        .then(() => console.log("🔁 Self-ping success"))
        .catch((err) => console.error("Self-ping failed:", err.message));
}, 4 * 60 * 1000);

// Start server
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server live at port ${PORT}`);
});
