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

// Use an API to get the current time in JST
async function getJSTWeeklyWindow() {
    try {
        const timeApiUrl = "http://worldtimeapi.org/api/timezone/Asia/Tokyo";
        const response = await axios.get(timeApiUrl);
        const nowJST = new Date(response.data.datetime);

        // Clone date and shift to start of week (Tuesday 00:00:01 JST)
        const jstDay = nowJST.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

        // Calculate how many days to subtract to get to this week's Tuesday
        const daysSinceTuesday = (jstDay + 6) % 7; // Mon=1, so we go back to last Tue
        const tuesdayStart = new Date(nowJST);
        tuesdayStart.setDate(nowJST.getDate() - daysSinceTuesday);
        tuesdayStart.setHours(0, 0, 1, 0); // 00:00:01 JST

        // Monday 23:59:59 of same week
        const mondayEnd = new Date(tuesdayStart);
        mondayEnd.setDate(tuesdayStart.getDate() + 6);
        mondayEnd.setHours(23, 59, 59, 999); // 23:59:59.999 JST

        return {
            startDate: tuesdayStart.toISOString(),
            endDate: mondayEnd.toISOString(),
        };
    } catch (err) {
        console.error("Error fetching JST time:", err.message);

        // Fallback: Local server time + 9 hours to approximate JST
        const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
        const jstDay = now.getDay();
        const daysSinceTuesday = (jstDay + 6) % 7;
        const tuesdayStart = new Date(now);
        tuesdayStart.setDate(now.getDate() - daysSinceTuesday);
        tuesdayStart.setHours(0, 0, 1, 0);

        const mondayEnd = new Date(tuesdayStart);
        mondayEnd.setDate(tuesdayStart.getDate() + 6);
        mondayEnd.setHours(23, 59, 59, 999);

        return {
            startDate: tuesdayStart.toISOString(),
            endDate: mondayEnd.toISOString(),
        };
    }
}


async function fetchLeaderboardData() {
    try {
        const period = await getJSTWeeklyWindow();
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
    const filtered = leaderboardCache.filter(
        (p) => p.weightedWager >= 1000 && p.weightedWager < 5000
    );
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

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server live at port ${PORT}`);
});