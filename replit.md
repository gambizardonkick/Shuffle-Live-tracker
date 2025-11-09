# Overview

This is a server-side automated bet tracking system for shuffle.com that scrapes ALL live bets using Puppeteer, converts bet amounts from various cryptocurrencies to USD, tracks comprehensive statistics (daily/weekly/monthly/lifetime profits and losses per user), and provides a password-protected admin panel to manage tracked users with individual Discord webhooks.

The application tracks betting activity in real-time, aggregates statistics across different time periods (daily, weekly, monthly, lifetime), provides a web dashboard for viewing bet history and statistics, and sends comprehensive Discord notifications for tracked users.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

**Browser Extension (Tampermonkey Userscript)**
- The primary data collection mechanism is a client-side userscript that runs on shuffle.com
- Uses DOM observation and interception to capture bet data in real-time
- Communicates with the backend via HTTP POST requests using GM_xmlhttpRequest
- Includes visual indicators to show tracking status
- Maintains a local set of processed bet IDs to prevent duplicate submissions
- Problem solved: Real-time data capture from a third-party website without access to their backend
- Rationale: Tampermonkey provides reliable cross-site request capabilities and persistent execution in the browser

## Backend Architecture

**Server Framework: Express.js**
- Chosen for its simplicity and widespread Node.js ecosystem support
- Provides RESTful API endpoints for bet submission and statistics retrieval
- Uses in-memory storage for bet data and statistics
- Pros: Fast development, minimal overhead, easy to understand
- Cons: Data not persisted across restarts (no database currently implemented)

**Data Storage**
- Currently uses in-memory JavaScript objects and arrays
- `bets` array stores individual bet records
- `betIds` Set prevents duplicate bet processing
- `stats` object maintains aggregated statistics with nested structure for time periods
- Problem: Need fast access to recent data and statistics
- Alternative considered: Database (Postgres/SQLite) - not yet implemented but architecture allows for future addition
- Rationale: In-memory storage provides fastest access for MVP and real-time requirements

**Statistics Aggregation**
- Multi-level statistics tracking: daily, weekly, and monthly periods
- Separate tracking for all bets vs. specific user (TheGoobr)
- Date key generation using ISO string formatting for consistency
- Custom week number calculation following ISO 8601 standard
- Biweekly period calculation for affiliate reporting (anchored to specific UTC date)

**Authentication**
- Password-protected admin panel for managing tracked users
- Password stored in environment variable `ADMIN_PASSWORD` (defaults to "GZ-HUA-12D-19")
- Admin endpoints require password verification via `/api/admin/verify`
- Problem: Need to secure admin panel from unauthorized access
- Rationale: Simple password-based auth sufficient for admin operations
- Frontend maintains authenticated state after successful login

## External Dependencies

**Discord Integration**
- Each tracked user has their own Discord webhook URL configured via admin panel
- Sends comprehensive notifications for each bet including:
  - Bet details (game, amount, multiplier, payout)
  - Daily stats (bets, win rate, profit)
  - Weekly stats (bets, win rate, profit)
  - Monthly stats (bets, win rate, profit)
  - Lifetime stats (total bets, total wagered, total profit)
- Uses axios for HTTP requests to Discord API
- Webhook URLs stored per-user in trackedUsers Map
- Stats are updated BEFORE sending to Discord to ensure current bet is included
- Problem solved: Each user can have notifications sent to different Discord channels
- Rationale: Prevents mixing different users' bets in the same Discord channel

**Affiliate Service API**
- Base URL: `https://api.your-affiliate-service.com`
- API Key: Stored directly in code (should be moved to environment variable)
- Endpoint: `/affiliate/creator/get-stats`
- Purpose: Fetch leaderboard and summarized betting data
- Date-range based queries using YYYY-MM-DD format
- Biweekly reporting periods for affiliate tracking

**Third-Party NPM Packages**
- `express`: Web server framework (v4.21.2)
- `axios`: HTTP client for external API calls (v1.7.9)
- `cors`: Cross-origin resource sharing middleware (v2.8.5)
- `moment`: Date/time manipulation library (v2.30.1)
- `puppeteer` and `puppeteer-extra`: Browser automation (v24.12.1) - purpose unclear from current codebase
- `node-fetch`: Alternative HTTP client (v3.3.2)

**Runtime Environment**
- Designed to run on Replit platform
- Uses environment variable `PORT` for dynamic port assignment
- Keep-alive mechanism via `keep_alive.js` for preventing Replit hibernation
- Multiple entry points: `server.js` (main), `index.js` (affiliate API client)

**Key Architectural Decisions**

1. **Real-time vs. Polling**: Chose real-time push from browser extension over polling shuffle.com API (if available) for instant notifications and reduced server load

2. **In-memory vs. Database**: Initially chose in-memory storage for simplicity, but architecture pattern suggests future database migration is planned

3. **Client-side Data Collection**: Browser extension approach chosen due to lack of official shuffle.com API access, allowing direct observation of bet activity

4. **Separate Affiliate Integration**: Built parallel system for fetching affiliate statistics from external service, enabling cross-verification of tracking accuracy