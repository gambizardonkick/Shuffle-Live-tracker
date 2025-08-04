    import express from "express";
    import axios from "axios";
    import cors from "cors";

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

    function getSmartDateRange() {
      const now = new Date();
      const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000); // UTC+9

      const jstYear = jstNow.getUTCFullYear();
      const jstMonth = jstNow.getUTCMonth(); // 0 = Jan, 5 = June, 6 = July

      // 🎯 Hardcoded for June + July 2025 (JST)
      if (jstYear === 2025 && (jstMonth === 5 || jstMonth === 6)) {
        return {
          startDate: "2025-05-31T15:01:00.000Z", // ✅ June 1, 00:01 JST
          endDate: "2025-07-31T15:00:00.000Z"    // ✅ Aug 1, 00:00 JST
        };
      }

      // 🧠 Dynamic fallback for other months
      const year = jstYear;
      const month = jstMonth;
      const getLastDay = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

      const prevMonth = month - 1 < 0 ? 11 : month - 1;
      const prevYear = month - 1 < 0 ? year - 1 : year;

      const startDate = new Date(Date.UTC(prevYear, prevMonth, getLastDay(prevYear, prevMonth), 15, 1, 0));
      const endDate = new Date(Date.UTC(year, month, getLastDay(year, month), 15, 0, 0));

      return {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      };
    }

    async function fetchLeaderboardData() {
      try {
        const { startDate, endDate } = getSmartDateRange();

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
          wagered: Math.round(player.wagered),
          weightedWager: Math.round(player.weightedWagered),
        }));

        const above100k = sorted.filter(player => player.weightedWagered >= 100000);

        leaderboardTop14Cache = (above100k.length >= 10 ? above100k : sorted.slice(0, 10)).map(player => ({
          username: formatUsername(player.username),
          wagered: Math.round(player.wagered),
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
      res.send("🎰 Roobet Leaderboard API Live – Auto Range with June+July special case");
    });

    app.get("/leaderboard", (req, res) => {
      res.json(leaderboardCache);
    });

    app.get("/leaderboard/top14", (req, res) => {
      res.json(leaderboardTop14Cache.slice(0, 14));
    });

    app.get("/current-range", (req, res) => {
      const { startDate, endDate } = getSmartDateRange();
      res.json({ startDate, endDate });
    });

    // Start server
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

    // Initial fetch
    fetchLeaderboardData();
    setInterval(fetchLeaderboardData, 5 * 60 * 1000);

    // Self-ping to keep Render alive
    setInterval(() => {
      axios
        .get("https://azisailbdata.onrender.com/leaderboard/top14")
        .then(() => console.log("🔁 Self-ping OK"))
        .catch((err) => console.error("❌ Self-ping failed:", err.message));
    }, 4 * 60 * 1000);
