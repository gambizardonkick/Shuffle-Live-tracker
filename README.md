# Shuffle.com Bet Tracker for TheGoobr

This project tracks bets from the user "TheGoobr" on shuffle.com and sends notifications to Discord with detailed statistics.

## Features

- 🎲 Real-time bet tracking via Tampermonkey userscript
- 📊 Daily, weekly, and monthly statistics
- 📨 Discord notifications for every bet
- 🌐 Web dashboard to view stats and recent bets
- 📈 Automatic stats aggregation

## Setup Instructions

### 1. Install the Backend Server

The backend is already running on Replit. You can access the dashboard at your Replit URL.

### 2. Install the Tampermonkey Script

1. Install [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. Open the `shuffle-bet-tracker.user.js` file
3. Copy the entire contents
4. In Tampermonkey, click "Create a new script"
5. Paste the script and **REPLACE** `YOUR_REPLIT_URL_HERE` with your actual Replit URL (e.g., `https://your-repl-name.your-username.repl.co`)
6. Save the script (Ctrl+S or Cmd+S)

### 3. Start Tracking

1. Visit [shuffle.com](https://shuffle.com)
2. You should see a green indicator in the top-right corner saying "Tracking TheGoobr"
3. When TheGoobr places a bet, it will automatically:
   - Send a notification to Discord
   - Update the stats on the dashboard
   - Store the bet data

## Dashboard Features

Visit your Replit URL to see:

- Real-time statistics (daily, weekly, monthly)
- Recent bets table
- Buttons to manually send stats to Discord

## API Endpoints

- `POST /api/bet` - Receive bet data from Tampermonkey
- `GET /api/stats/:period` - Get stats for daily/weekly/monthly
- `POST /api/stats/:period/send` - Send stats to Discord
- `GET /api/bets` - Get recent bets
- `GET /api/stats/all` - Get all stats at once

## How It Works

1. The Tampermonkey script monitors shuffle.com for bets from TheGoobr
2. When a bet is detected, it sends the data to your Replit backend
3. The backend stores the bet, updates statistics, and sends to Discord
4. You can view everything on the web dashboard

## Customization

To track a different user, edit the Tampermonkey script:
```javascript
const TARGET_USERNAME = 'TheGoobr'; // Change this to any username
```

## Notes

- The script checks for new bets every 2 seconds
- Stats are calculated in real-time
- The green indicator shows the script is active
- Check the browser console for debug logs
