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

        // Day index: 0=Sun, 1=Mon, ..., 6=Sat
        const jstDay = nowJST.getDay();

        // Find this week's Monday 23:59:59 JST
        const mondayThisWeek = new Date(nowJST);
        mondayThisWeek.setDate(nowJST.getDate() - ((jstDay + 6) % 7)); // go back to Monday
        mondayThisWeek.setHours(23, 59, 59, 999);

        // If now is after this Monday's cutoff, start from this Monday 23:59:59
        // Else start from last Monday's cutoff
        let start;
        if (nowJST > mondayThisWeek) {
            start = new Date(mondayThisWeek.getTime() + 1000); // Tuesday 00:00:00 JST
        } else {
            const lastMonday = new Date(mondayThisWeek);
            lastMonday.setDate(lastMonday.getDate() - 7);
            start = new Date(lastMonday.getTime() + 1000);
        }

        // End is next Monday 23:59:59 JST
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);

        return {
            startDate: start.toISOString(),
            endDate: end.toISOString(),
        };
    } catch (err) {
        console.error("Error fetching JST time:", err.message);

        // Fallback using server time + 9 hours
        const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
        const jstDay = now.getDay();
        const mondayThisWeek = new Date(now);
        mondayThisWeek.setDate(now.getDate() - ((jstDay + 6) % 7));
        mondayThisWeek.setHours(23, 59, 59, 999);

        let start;
        if (now > mondayThisWeek) {
            start = new Date(mondayThisWeek.getTime() + 1000);
        } else {
            const lastMonday = new Date(mondayThisWeek);
            lastMonday.setDate(lastMonday.getDate() - 7);
            start = new Date(lastMonday.getTime() + 1000);
        }

        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);

        return {
            startDate: start.toISOString(),
            endDate: end.toISOString(),
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