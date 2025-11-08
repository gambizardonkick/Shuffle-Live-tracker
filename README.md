# Shuffle.com Automated Bet Tracker with Currency Conversion

Server-side bet tracking system that automatically monitors shuffle.com and tracks all bets with multi-currency support and USD conversion.

## Features

🤖 **Automated Server-Side Scraping**
- Puppeteer-based scraper runs on the server
- No browser extension needed!
- Monitors shuffle.com automatically 24/7

💱 **Multi-Currency Support**
- Tracks bets in BTC, ETH, USDT, USDC, LTC, BCH, DOGE, XRP, BNB, SOL, ADA, TRX
- Real-time crypto prices from CoinGecko API
- Automatic USD conversion for all bets
- Display both original currency and USD value

📊 **Comprehensive Per-User Stats**
- Track individual user performance
- Daily, weekly, monthly profit/loss tracking
- Win rate, average bet size, average multiplier
- Biggest wins and losses
- Game preferences per user
- Currency usage breakdown

📨 **Discord Integration**
- Automatic notifications for TheGoobr's bets
- Shows bet amount in original currency + USD
- Win/loss indicators with colors

## How It Works

1. **Puppeteer Scraper**: Headless Chrome browser visits shuffle.com
2. **Bet Detection**: Scans the bet table every 2 seconds
3. **Currency Recognition**: Identifies crypto currency from icons
4. **Price Conversion**: Fetches live crypto prices, converts to USD
5. **Stats Tracking**: Calculates per-user daily/weekly/monthly stats
6. **Discord Notifications**: Sends TheGoobr's bets to Discord

## Dashboard Features

### Recent Bets Tab
- Live feed of all bets
- Shows: User, Game, Bet Amount (original + USD), Multiplier, Payout (original + USD)
- Filter by username
- Real-time stats: Total bets, wagered, win rate

### Top Users Tab
- Leaderboard of most active users
- Total bets, wagered amount (USD), profit/loss
- View detailed stats for any user

### TheGoobr Stats Tab
- Dedicated stats for TheGoobr
- Daily/weekly/monthly breakdown
- Recent bet history

### Crypto Prices Panel
- Live crypto prices in USD
- Updates every minute
- Supports 12+ major cryptocurrencies

## API Endpoints

- `GET /api/bets?limit=100&username=TheGoobr` - Get recent bets
- `GET /api/users` - Get all users sorted by volume
- `GET /api/user/:username/stats` - Get user stats (daily/weekly/monthly)
- `GET /api/prices` - Get current crypto prices

## Technical Stack

- **Backend**: Node.js + Express
- **Scraping**: Puppeteer (headless Chrome)
- **Price API**: CoinGecko
- **Notifications**: Discord Webhooks
- **Storage**: In-memory (resets on restart)

## Environment Variables

- `DISCORD_WEBHOOK_URL` - Your Discord webhook URL
- `PORT` - Server port (default: 5000)

## Output Format

Each bet includes:
- Username
- Game
- Currency (BTC, ETH, USDT, etc.)
- Bet Amount (original currency)
- Bet Amount USD
- Multiplier
- Payout (original currency)
- Payout USD
- Win/Loss status
- Timestamp

## Stats Tracked Per User

### Daily/Weekly/Monthly:
- Total bets
- Total wagered (USD)
- Total payout (USD)
- Net profit/loss (USD)
- Win count & loss count
- Win rate percentage
- Average bet size (USD)
- Average multiplier
- Biggest win (USD)
- Biggest loss (USD)
- Games played
- Currencies used

## Notes

- Scraper runs automatically when server starts
- Crypto prices update every 60 seconds
- Dashboard auto-refreshes every 3 seconds
- Bet deduplication prevents duplicate tracking
- In-memory storage means data resets on server restart
- For production, consider adding database persistence
