const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Your API key for affiliate service
const API_KEY = 'c8d7147e-a896-4992-8abf-d84504f17191';
const BASE_URL = 'https://api.your-affiliate-service.com';
const STATS_ENDPOINT = '/affiliate/creator/get-stats';

// Utility to format Date as YYYY-MM-DD
function formatDate(date) {
  return date.toISOString().substring(0, 10);
}

// Calculate biweekly periods starting from 2025-09-17 00:00 UTC
function getBiweeklyPeriods() {
  const anchor = new Date(Date.UTC(2025, 8, 17, 0, 0, 0));
  const now = new Date();

  const msPerPeriod = 14 * 24 * 60 * 60 * 1000;
  const elapsedPeriods = Math.floor((now - anchor) / msPerPeriod);

  const currentStart = new Date(anchor.getTime() + elapsedPeriods * msPerPeriod);
  const currentEnd = new Date(currentStart.getTime() + msPerPeriod - 1);

  const previousStart = new Date(currentStart.getTime() - msPerPeriod);
  const previousEnd = new Date(currentStart.getTime() - 1);

  return {
    current: { from: currentStart, to: currentEnd },
    previous: { from: previousStart, to: previousEnd }
  };
}

// Fetch leaderboard data from affiliate API for given range
async function fetchLeaderboard(fromDate, toDate) {
  try {
    const resp = await axios.post(BASE_URL + STATS_ENDPOINT, {
      apikey: API_KEY,
      from: formatDate(fromDate),
      to: formatDate(toDate),
    });
    if (resp.data.error) {
      throw new Error(resp.data.message || 'API error');
    }
    return resp.data.data.summarizedBets || [];
  } catch (error) {
    console.error('Fetch error:', error.message);
    return null;
  }
}

// Mask usernames, e.g., co***17
function maskUsername(username) {
  if (username.length <= 4) return username;
  return username.slice(0, 2) + '***' + username.slice(-2);
}

// Format data to required output structure
function formatOutput(data) {
  if (!data) return [];
  return data.map(u => ({
    username: maskUsername(u.user.username),
    wagered: u.wager,
    weightedWager: u.wager,
  }));
}

// Express endpoint for current leaderboard data
app.get('/leaderboard/upgrader', async (req, res) => {
  const periods = getBiweeklyPeriods();
  const data = await fetchLeaderboard(periods.current.from, periods.current.to);
  if (data === null) return res.status(500).json({ error: 'Failed to fetch data' });
  res.json(formatOutput(data));
});

// Express endpoint for previous leaderboard data
app.get('/leaderboard/prev-upgrade', async (req, res) => {
  const periods = getBiweeklyPeriods();
  const data = await fetchLeaderboard(periods.previous.from, periods.previous.to);
  if (data === null) return res.status(500).json({ error: 'Failed to fetch data' });
  res.json(formatOutput(data));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
