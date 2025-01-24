const express = require("express");
const axios = require("axios");
const cors = require("cors"); // Import CORS
const app = express();
const PORT = process.env.PORT || 5000; // Use the environment's PORT or default to 5000

// Use CORS middleware
app.use(cors());

// API details
const apiUrl = "https://roobetconnect.com/affiliate/v2/stats";
const apiKey =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjI2YWU0ODdiLTU3MDYtNGE3ZS04YTY5LTMzYThhOWM5NjMxYiIsIm5vbmNlIjoiZWI2MzYyMWUtMTMwZi00ZTE0LTlmOWMtOTY3MGNiZGFmN2RiIiwic2VydmljZSI6ImFmZmlsaWF0ZVN0YXRzIiwiaWF0IjoxNzI3MjQ2NjY1fQ.rVG_QKMcycBEnzIFiAQuixfu6K_oEkAq2Y8Gukco3b8"; // Replace with your actual API key

let leaderboardCache = [];

// Function to format usernames by adding "***" in the middle
const formatUsername = (username) => {
    const mid = Math.floor(username.length / 2);
    return `${username.slice(0, mid)}***${username.slice(mid)}`; // Insert "***" in the middle
};

// Function to fetch and process leaderboard data
async function fetchLeaderboardData() {
    try {
        const response = await axios.get(apiUrl, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
            params: {
                userId: "26ae487b-5706-4a7e-8a69-33a8a9c9631b",
                startDate: "2025-01-12",
                endDate: "2025-02-12",
            },
        });

        const data = response.data;

        leaderboardCache = data
            .filter((player) => player.username !== "azisai205") // Remove "azisai205"
            .sort((a, b) => b.weightedWagered - a.weightedWagered)
            .slice(0, 10)
            .map((player, index) => ({
                username: formatUsername(player.username), // Format the username
                wagered: Math.round(player.weightedWagered),
                weightedWager: Math.round(player.weightedWagered),
            }));

        console.log("Leaderboard updated:", leaderboardCache);
    } catch (error) {
        console.error("Error fetching leaderboard data:", error.message);
    }
}

// Set up a route for the root
app.get("/", (req, res) => {
    res.send(
        "Welcome to the Leaderboard API. Access the leaderboard at /leaderboard",
    );
});

// Set up a route to serve the leaderboard data
app.get("/leaderboard", (req, res) => {
    res.json(leaderboardCache);
});

// Fetch leaderboard data every 5 minutes
fetchLeaderboardData(); // Initial fetch
setInterval(fetchLeaderboardData, 5 * 60 * 1000); // Update every 5 minutes

// Start the Express server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
const keep_alive = require('./keep_alive.js')