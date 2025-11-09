const express = require('express');
const cors = require('cors');
const axios = require('axios');
// Use network interception scraper for 100% bet capture rate
const { startScraper, stopScraper, getCryptoPrices } = require('./scraper-network');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const bets = [];
const userStats = {};
const trackedUsers = new Map(); // Users to track permanently with their webhook URLs
trackedUsers.set('TheGoobr', { webhookUrl: DISCORD_WEBHOOK_URL }); // Default user
const trackedUserBets = {}; // Permanent storage for tracked users' bets
const serverStartTime = new Date();

function getDateKey(date) {
    const d = new Date(date);
    return d.toISOString().split('T')[0];
}

function getWeekKey(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const week = getWeekNumber(d);
    return `${year}-W${String(week).padStart(2, '0')}`;
}

function getMonthKey(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return weekNo;
}

function initUserStats(username) {
    if (!userStats[username]) {
        userStats[username] = {
            daily: {},
            weekly: {},
            monthly: {},
            totalBets: 0,
            totalWageredUSD: 0,
            totalPayoutUSD: 0,
            totalProfitUSD: 0
        };
    }
}

function initPeriodStats() {
    return {
        totalBets: 0,
        totalWageredUSD: 0,
        totalPayoutUSD: 0,
        totalProfitUSD: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        averageBetUSD: 0,
        averageMultiplier: 0,
        biggestWinUSD: 0,
        biggestLossUSD: 0,
        games: {},
        currencies: {},
        multipliers: []
    };
}

function updateUserStats(bet) {
    const username = bet.username;
    initUserStats(username);
    
    const dayKey = getDateKey(bet.timestamp);
    const weekKey = getWeekKey(bet.timestamp);
    const monthKey = getMonthKey(bet.timestamp);
    
    const user = userStats[username];
    
    if (!user.daily[dayKey]) user.daily[dayKey] = initPeriodStats();
    if (!user.weekly[weekKey]) user.weekly[weekKey] = initPeriodStats();
    if (!user.monthly[monthKey]) user.monthly[monthKey] = initPeriodStats();
    
    const betAmountUSD = bet.betAmountUSD || 0;
    const payoutUSD = bet.payoutUSD || 0;
    const profitUSD = payoutUSD;
    const multiplier = bet.multiplier || 0;
    const isWin = bet.isWin || payoutUSD > 0;
    
    user.totalBets++;
    user.totalWageredUSD += betAmountUSD;
    user.totalPayoutUSD += isWin ? payoutUSD : 0;
    user.totalProfitUSD += profitUSD;
    
    [dayKey, weekKey, monthKey].forEach((key, idx) => {
        const periodStats = idx === 0 ? user.daily[key] : idx === 1 ? user.weekly[key] : user.monthly[key];
        
        periodStats.totalBets++;
        periodStats.totalWageredUSD += betAmountUSD;
        periodStats.totalPayoutUSD += isWin ? payoutUSD : 0;
        periodStats.totalProfitUSD += profitUSD;
        
        if (isWin) {
            periodStats.wins++;
            if (profitUSD > periodStats.biggestWinUSD) periodStats.biggestWinUSD = profitUSD;
        } else {
            periodStats.losses++;
            if (profitUSD < periodStats.biggestLossUSD) periodStats.biggestLossUSD = profitUSD;
        }
        
        periodStats.winRate = periodStats.totalBets > 0 ? (periodStats.wins / periodStats.totalBets * 100) : 0;
        periodStats.averageBetUSD = periodStats.totalBets > 0 ? (periodStats.totalWageredUSD / periodStats.totalBets) : 0;
        
        periodStats.multipliers.push(multiplier);
        const validMultipliers = periodStats.multipliers.filter(m => m > 0);
        periodStats.averageMultiplier = validMultipliers.length > 0 ? 
            (validMultipliers.reduce((a, b) => a + b, 0) / validMultipliers.length) : 0;
        
        periodStats.games[bet.game] = (periodStats.games[bet.game] || 0) + 1;
        periodStats.currencies[bet.currency] = (periodStats.currencies[bet.currency] || 0) + 1;
    });
}

async function sendToDiscord(bet, webhookUrl) {
    if (!webhookUrl) return;
    
    const username = bet.username;
    const isWin = bet.isWin;
    const profitLoss = bet.payoutUSD - bet.betAmountUSD;
    
    // Get user stats
    const now = new Date();
    const stats = userStats[username] || {
        totalBets: 0,
        totalWageredUSD: 0,
        totalProfitUSD: 0,
        daily: {},
        weekly: {},
        monthly: {}
    };
    
    const dayKey = getDateKey(now);
    const weekKey = getWeekKey(now);
    const monthKey = getMonthKey(now);
    
    const dailyStats = stats.daily[dayKey] || initPeriodStats();
    const weeklyStats = stats.weekly[weekKey] || initPeriodStats();
    const monthlyStats = stats.monthly[monthKey] || initPeriodStats();
    
    // Format numbers with + or - sign for profit/loss
    const formatProfit = (val) => {
        const sign = val >= 0 ? '+' : '';
        return `${sign}$${val.toFixed(2)}`;
    };
    
    const embed = {
        author: {
            name: `${username} • Bet Notification`,
            icon_url: 'https://cdn.discordapp.com/emojis/741395740474736742.png'
        },
        title: `${isWin ? '🎉 WIN' : '💸 LOSS'} • ${bet.game}`,
        description: `${isWin ? '**Congratulations!**' : '**Better luck next time**'}\n${bet.multiplierText} multiplier`,
        color: isWin ? 0x22c55e : 0xef4444,
        fields: [
            {
                name: '💵 Bet Details',
                value: [
                    `\`\`\``,
                    `Bet:        ${bet.betAmountText} ${bet.currency}`,
                    `USD Value:  $${bet.betAmountUSD.toFixed(2)}`,
                    `Multiplier: ${bet.multiplierText}`,
                    `Payout:     ${bet.payoutText} ${bet.currency}`,
                    `USD Value:  $${bet.payoutUSD.toFixed(2)}`,
                    `───────────────────────────`,
                    `Profit:     ${formatProfit(profitLoss)}`,
                    `\`\`\``
                ].join('\n'),
                inline: false
            },
            {
                name: '📊 Daily Performance',
                value: [
                    `**Bets:** ${dailyStats.totalBets}`,
                    `**Win Rate:** ${dailyStats.winRate.toFixed(1)}%`,
                    `**Profit:** ${formatProfit(dailyStats.totalProfitUSD)}`
                ].join('\n'),
                inline: true
            },
            {
                name: '📅 Weekly Performance',
                value: [
                    `**Bets:** ${weeklyStats.totalBets}`,
                    `**Win Rate:** ${weeklyStats.winRate.toFixed(1)}%`,
                    `**Profit:** ${formatProfit(weeklyStats.totalProfitUSD)}`
                ].join('\n'),
                inline: true
            },
            {
                name: '📆 Monthly Performance',
                value: [
                    `**Bets:** ${monthlyStats.totalBets}`,
                    `**Win Rate:** ${monthlyStats.winRate.toFixed(1)}%`,
                    `**Profit:** ${formatProfit(monthlyStats.totalProfitUSD)}`
                ].join('\n'),
                inline: true
            },
            {
                name: '🏆 Lifetime Statistics',
                value: [
                    `\`\`\``,
                    `Total Bets:    ${stats.totalBets.toLocaleString()}`,
                    `Total Wagered: $${stats.totalWageredUSD.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`,
                    `Total Profit:  ${formatProfit(stats.totalProfitUSD)}`,
                    `\`\`\``
                ].join('\n'),
                inline: false
            }
        ],
        timestamp: new Date(bet.timestamp).toISOString(),
        footer: {
            text: `Shuffle.com Bet Tracker • ${new Date(bet.timestamp).toLocaleString('en-US', { timeZone: 'UTC', hour12: true })}`,
            icon_url: 'https://cdn.discordapp.com/emojis/741395740474736742.png'
        }
    };
    
    try {
        await axios.post(webhookUrl, { embeds: [embed] });
        console.log(`✅ Sent ${username} bet to Discord with comprehensive stats`);
    } catch (error) {
        console.error(`Error sending ${username} to Discord:`, error.message);
    }
}

function handleBet(betData) {
    bets.push(betData);
    
    // Keep unlimited bets - text is lightweight
    // Only trim if we hit 100k to prevent extreme memory issues
    if (bets.length > 100000) {
        bets.splice(0, 50000);
    }
    
    // Update stats FIRST before sending to Discord
    updateUserStats(betData);
    
    // Store tracked users' bets permanently (never delete)
    if (trackedUsers.has(betData.username)) {
        if (!trackedUserBets[betData.username]) {
            trackedUserBets[betData.username] = [];
        }
        trackedUserBets[betData.username].push(betData);
        
        // Send to Discord using user's specific webhook URL (stats now include this bet)
        const userConfig = trackedUsers.get(betData.username);
        if (userConfig && userConfig.webhookUrl) {
            sendToDiscord(betData, userConfig.webhookUrl);
        }
    }
}

app.get('/api/bets', (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit) : null;
    const username = req.query.username;
    
    let filteredBets = bets;
    if (username) {
        filteredBets = bets.filter(b => b.username === username);
    }
    
    // Return all bets if no limit specified
    const result = limit ? filteredBets.slice(-limit).reverse() : filteredBets.slice().reverse();
    res.json(result);
});

app.get('/api/users', (req, res) => {
    const userList = Object.keys(userStats).map(username => ({
        username,
        totalBets: userStats[username].totalBets,
        totalWageredUSD: userStats[username].totalWageredUSD,
        totalProfitUSD: userStats[username].totalProfitUSD
    })).sort((a, b) => b.totalWageredUSD - a.totalWageredUSD);
    
    res.json(userList);
});

app.get('/api/user/:username/stats', (req, res) => {
    const username = req.params.username;
    const now = new Date();
    
    if (!userStats[username]) {
        return res.json({
            daily: initPeriodStats(),
            weekly: initPeriodStats(),
            monthly: initPeriodStats()
        });
    }
    
    res.json({
        daily: userStats[username].daily[getDateKey(now)] || initPeriodStats(),
        weekly: userStats[username].weekly[getWeekKey(now)] || initPeriodStats(),
        monthly: userStats[username].monthly[getMonthKey(now)] || initPeriodStats(),
        allTime: {
            totalBets: userStats[username].totalBets,
            totalWageredUSD: userStats[username].totalWageredUSD,
            totalProfitUSD: userStats[username].totalProfitUSD
        }
    });
});

app.get('/api/prices', (req, res) => {
    res.json(getCryptoPrices());
});

// Admin password verification
app.post('/api/admin/verify', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: 'Invalid password' });
    }
});

// Tracked users management
app.get('/api/tracked-users', (req, res) => {
    const users = Array.from(trackedUsers.entries()).map(([username, config]) => ({
        username,
        totalBets: trackedUserBets[username]?.length || 0,
        webhookUrl: config.webhookUrl ? '***' + config.webhookUrl.slice(-10) : 'Not set',
        trackingSince: serverStartTime.toISOString()
    }));
    res.json(users);
});

app.post('/api/tracked-users', (req, res) => {
    const { username, webhookUrl, password } = req.body;
    
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Invalid password' });
    }
    
    if (!username) {
        return res.status(400).json({ error: 'Username required' });
    }
    
    if (!webhookUrl || !webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
        return res.status(400).json({ error: 'Valid Discord webhook URL required' });
    }
    
    trackedUsers.set(username, { webhookUrl });
    if (!trackedUserBets[username]) {
        trackedUserBets[username] = [];
    }
    
    res.json({ success: true, username, message: `${username} is now being tracked permanently` });
});

app.delete('/api/tracked-users/:username', (req, res) => {
    const { username } = req.params;
    const { password } = req.body;
    
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Invalid password' });
    }
    
    trackedUsers.delete(username);
    res.json({ success: true, username, message: `${username} removed from tracked users` });
});

app.get('/api/tracked-users/:username/bets', (req, res) => {
    const { username } = req.params;
    const userBets = trackedUserBets[username] || [];
    res.json({
        username,
        totalBets: userBets.length,
        trackingSince: serverStartTime.toISOString(),
        bets: userBets.slice().reverse()
    });
});

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Shuffle.com Live Bet Tracker</title>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                    background: linear-gradient(135deg, #0a0e27 0%, #1a1f3a 100%);
                    color: #e8eaed;
                    padding: 20px;
                    min-height: 100vh;
                }
                .container { max-width: 1800px; margin: 0 auto; }
                h1 { 
                    color: #00ff88;
                    margin-bottom: 8px;
                    font-size: 32px;
                    font-weight: 700;
                    text-shadow: 0 2px 10px rgba(0, 255, 136, 0.3);
                }
                h2 { 
                    color: #00ff88;
                    margin-bottom: 20px;
                    font-size: 24px;
                    font-weight: 600;
                }
                .status { 
                    color: #9aa0a6;
                    margin-bottom: 24px;
                    font-size: 14px;
                }
                .prices { 
                    background: rgba(26, 31, 58, 0.6);
                    backdrop-filter: blur(10px);
                    padding: 20px;
                    border-radius: 12px;
                    margin-bottom: 24px;
                    border: 1px solid rgba(0, 255, 136, 0.1);
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                }
                .prices h3 { 
                    color: #00ff88;
                    margin-bottom: 15px;
                    font-size: 16px;
                    font-weight: 600;
                }
                .price-grid { 
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
                    gap: 12px;
                }
                .price-item { 
                    background: rgba(10, 14, 39, 0.8);
                    padding: 12px;
                    border-radius: 8px;
                    text-align: center;
                    border: 1px solid rgba(0, 255, 136, 0.15);
                    transition: all 0.2s;
                }
                .price-item:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(0, 255, 136, 0.15);
                }
                .price-item .currency { 
                    font-weight: 600;
                    color: #00ff88;
                    font-size: 13px;
                }
                .price-item .value { 
                    font-size: 12px;
                    color: #9aa0a6;
                    margin-top: 4px;
                }
                .tabs { 
                    display: flex;
                    gap: 8px;
                    margin-bottom: 24px;
                    flex-wrap: wrap;
                }
                .tab { 
                    background: rgba(26, 31, 58, 0.6);
                    color: #00ff88;
                    border: 1px solid rgba(0, 255, 136, 0.3);
                    padding: 10px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 500;
                    font-size: 14px;
                    transition: all 0.2s;
                }
                .tab:hover { 
                    background: rgba(0, 255, 136, 0.1);
                    border-color: #00ff88;
                    transform: translateY(-1px);
                }
                .tab.active { 
                    background: #00ff88;
                    color: #0a0e27;
                    border-color: #00ff88;
                    box-shadow: 0 4px 12px rgba(0, 255, 136, 0.3);
                }
                #dynamicTabs { display: flex; gap: 8px; flex-wrap: wrap; }
                table { 
                    width: 100%;
                    border-collapse: collapse;
                    background: rgba(26, 31, 58, 0.6);
                    border-radius: 12px;
                    overflow: hidden;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                    border: 1px solid rgba(0, 255, 136, 0.1);
                }
                th { 
                    background: linear-gradient(135deg, #00ff88 0%, #00dd77 100%);
                    color: #0a0e27;
                    padding: 14px 12px;
                    text-align: left;
                    font-weight: 600;
                    font-size: 13px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    position: sticky;
                    top: 0;
                }
                td { 
                    padding: 12px;
                    border-bottom: 1px solid rgba(42, 47, 74, 0.5);
                    font-size: 14px;
                }
                tr:hover { 
                    background: rgba(42, 47, 74, 0.4);
                }
                tr:last-child td {
                    border-bottom: none;
                }
                .win { 
                    color: #00ff88;
                    font-weight: 600;
                }
                .loss { 
                    color: #ff6b6b;
                    font-weight: 600;
                }
                button { 
                    background: linear-gradient(135deg, #00ff88 0%, #00dd77 100%);
                    color: #0a0e27;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 600;
                    font-size: 14px;
                    transition: all 0.2s;
                    box-shadow: 0 2px 8px rgba(0, 255, 136, 0.2);
                }
                button:hover { 
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(0, 255, 136, 0.4);
                }
                button:active {
                    transform: translateY(0);
                }
                .stats-grid { 
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                    gap: 16px;
                    margin-bottom: 24px;
                }
                .stat-card { 
                    background: rgba(26, 31, 58, 0.6);
                    backdrop-filter: blur(10px);
                    padding: 24px;
                    border-radius: 12px;
                    border-left: 4px solid #00ff88;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                    transition: all 0.2s;
                }
                .stat-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
                }
                .stat-card h3 { 
                    color: #00ff88;
                    font-size: 13px;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    margin-bottom: 12px;
                }
                .stat-card .value { 
                    font-size: 28px;
                    font-weight: 700;
                    color: #fff;
                    margin-bottom: 4px;
                }
                .stat-card .label { 
                    font-size: 13px;
                    color: #9aa0a6;
                    margin-top: 6px;
                    line-height: 1.5;
                }
                input { 
                    background: rgba(26, 31, 58, 0.6);
                    color: #fff;
                    border: 1px solid rgba(0, 255, 136, 0.3);
                    padding: 12px 16px;
                    border-radius: 8px;
                    margin-bottom: 12px;
                    width: 100%;
                    max-width: 500px;
                    font-size: 14px;
                    transition: all 0.2s;
                }
                input:focus {
                    outline: none;
                    border-color: #00ff88;
                    box-shadow: 0 0 0 3px rgba(0, 255, 136, 0.1);
                }
                input::placeholder {
                    color: #5f6368;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🎲 Shuffle.com Live Bet Tracker</h1>
                <p class="status">Server-side scraping - Auto refresh every 3s</p>
                
                <div class="prices" id="prices">
                    <h3>💰 Crypto Prices (USD)</h3>
                    <div class="price-grid" id="priceGrid"></div>
                </div>
                
                <div class="tabs" id="tabsContainer">
                    <div class="tab active" onclick="switchTab('recent')">Recent Bets</div>
                    <div class="tab" onclick="switchTab('users')">Top Users</div>
                    <div class="tab" onclick="switchTab('admin')">⚙️ Admin Panel</div>
                    <div id="dynamicTabs"></div>
                </div>
                
                <div id="recentTab">
                    <div class="stats-grid" id="statsGrid"></div>
                    <input type="text" id="userFilter" placeholder="Filter by username..." onkeyup="filterBets()">
                    <table>
                        <thead>
                            <tr>
                                <th>Time</th>
                                <th>User</th>
                                <th>Game</th>
                                <th>Bet Amount</th>
                                <th>USD Value</th>
                                <th>Multiplier</th>
                                <th>Payout</th>
                                <th>Payout USD</th>
                                <th>Result</th>
                            </tr>
                        </thead>
                        <tbody id="betsBody"></tbody>
                    </table>
                </div>
                
                <div id="usersTab" style="display:none;">
                    <table>
                        <thead>
                            <tr>
                                <th>Username</th>
                                <th>Total Bets</th>
                                <th>Total Wagered (USD)</th>
                                <th>Total Profit (USD)</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="usersBody"></tbody>
                    </table>
                </div>
                
                <div id="thegoobrTab" style="display:none;">
                    <div class="stats-grid" id="thegoobrStats"></div>
                    <table>
                        <thead>
                            <tr>
                                <th>Time</th>
                                <th>Game</th>
                                <th>Bet Amount</th>
                                <th>USD</th>
                                <th>Multiplier</th>
                                <th>Payout USD</th>
                                <th>Result</th>
                            </tr>
                        </thead>
                        <tbody id="thegoobrBody"></tbody>
                    </table>
                </div>
                
                <div id="adminTab" style="display:none;">
                    <div id="adminLogin" style="display:block;">
                        <div class="stat-card" style="max-width: 500px; margin: 100px auto;">
                            <h2>🔒 Admin Panel - Password Required</h2>
                            <p style="color: #888; margin: 15px 0;">Enter admin password to manage tracked users</p>
                            <input type="password" id="adminPassword" placeholder="Enter admin password..." style="width: 100%;">
                            <button onclick="verifyPassword()">Login</button>
                        </div>
                    </div>
                    
                    <div id="adminPanel" style="display:none;">
                        <h2>⚙️ Admin Panel - Manage Tracked Users</h2>
                        <div class="stat-card" style="margin-bottom: 20px;">
                            <h3>Add New User to Track</h3>
                            <input type="text" id="newUsername" placeholder="Enter username to track..." style="width: 100%; margin-bottom: 10px;">
                            <input type="text" id="newWebhookUrl" placeholder="Discord Webhook URL (https://discord.com/api/webhooks/...)" style="width: 100%; margin-bottom: 10px;">
                            <button onclick="addTrackedUser()">Add User</button>
                            <p style="color: #888; margin-top: 10px;">⚠️ Each user sends bets to their own Discord webhook channel. Bets are stored permanently and never deleted.</p>
                        </div>
                        
                        <h3>Currently Tracked Users</h3>
                        <table>
                            <thead>
                                <tr>
                                    <th>Username</th>
                                    <th>Total Lifetime Bets</th>
                                    <th>Webhook URL</th>
                                    <th>Tracking Since</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="trackedUsersBody"></tbody>
                        </table>
                    </div>
                </div>
                
                <div id="trackedUserTabs"></div>
            </div>
            
            <script>
                let currentTab = 'recent';
                let allBets = [];
                let trackedUsers = [];
                let adminPassword = null;
                let isAdminAuthenticated = false;
                
                async function verifyPassword() {
                    const password = document.getElementById('adminPassword').value;
                    const res = await fetch('/api/admin/verify', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ password })
                    });
                    
                    const result = await res.json();
                    if (result.success) {
                        adminPassword = password;
                        isAdminAuthenticated = true;
                        document.getElementById('adminLogin').style.display = 'none';
                        document.getElementById('adminPanel').style.display = 'block';
                        await loadTrackedUsers();
                    } else {
                        alert('Invalid password! Try again.');
                        document.getElementById('adminPassword').value = '';
                    }
                }
                
                async function switchTab(tab) {
                    currentTab = tab;
                    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                    if (event && event.target) event.target.classList.add('active');
                    
                    // Hide all tabs
                    document.getElementById('recentTab').style.display = 'none';
                    document.getElementById('usersTab').style.display = 'none';
                    document.getElementById('thegoobrTab').style.display = 'none';
                    document.getElementById('adminTab').style.display = 'none';
                    document.querySelectorAll('.tracked-user-tab').forEach(t => t.style.display = 'none');
                    
                    // Show selected tab
                    if (tab === 'recent') {
                        document.getElementById('recentTab').style.display = 'block';
                        await loadBets();
                    } else if (tab === 'users') {
                        document.getElementById('usersTab').style.display = 'block';
                        await loadUsers();
                    } else if (tab === 'thegoobr') {
                        document.getElementById('thegoobrTab').style.display = 'block';
                        await loadTheGoobr();
                    } else if (tab === 'admin') {
                        document.getElementById('adminTab').style.display = 'block';
                        if (!isAdminAuthenticated) {
                            document.getElementById('adminLogin').style.display = 'block';
                            document.getElementById('adminPanel').style.display = 'none';
                        } else {
                            document.getElementById('adminLogin').style.display = 'none';
                            document.getElementById('adminPanel').style.display = 'block';
                        }
                    } else {
                        // Tracked user tab
                        const userTab = document.getElementById(\`user-\${tab}\`);
                        if (userTab) {
                            userTab.style.display = 'block';
                            await loadTrackedUserData(tab);
                        }
                    }
                }
                
                async function loadPrices() {
                    const res = await fetch('/api/prices');
                    const prices = await res.json();
                    
                    const priceHtml = Object.entries(prices).map(([currency, price]) => \`
                        <div class="price-item">
                            <div class="currency">\${currency}</div>
                            <div class="value">$\${price.toFixed(2)}</div>
                        </div>
                    \`).join('');
                    
                    document.getElementById('priceGrid').innerHTML = priceHtml;
                }
                
                async function loadBets() {
                    const res = await fetch('/api/bets');
                    allBets = await res.json();
                    displayBets(allBets);
                    
                    const totalBets = allBets.length;
                    const totalWagered = allBets.reduce((sum, bet) => sum + bet.betAmountUSD, 0);
                    const totalPayout = allBets.reduce((sum, bet) => sum + bet.payoutUSD, 0);
                    const wins = allBets.filter(b => b.isWin).length;
                    
                    document.getElementById('statsGrid').innerHTML = \`
                        <div class="stat-card">
                            <h3>Total Bets</h3>
                            <div class="value">\${totalBets}</div>
                            <div class="label">Tracked in session</div>
                        </div>
                        <div class="stat-card">
                            <h3>Total Wagered</h3>
                            <div class="value">$\${totalWagered.toFixed(2)}</div>
                            <div class="label">USD value</div>
                        </div>
                        <div class="stat-card">
                            <h3>Win Rate</h3>
                            <div class="value">\${((wins / totalBets) * 100).toFixed(1)}%</div>
                            <div class="label">\${wins} wins / \${totalBets - wins} losses</div>
                        </div>
                    \`;
                }
                
                function displayBets(bets) {
                    const rows = bets.map(bet => \`
                        <tr class="\${bet.username === 'TheGoobr' ? 'highlight' : ''}">
                            <td>\${new Date(bet.timestamp).toLocaleTimeString()}</td>
                            <td><strong>\${bet.username}</strong></td>
                            <td>\${bet.game}</td>
                            <td>\${bet.betAmountText} \${bet.currency}</td>
                            <td>$\${bet.betAmountUSD.toFixed(2)}</td>
                            <td>\${bet.multiplierText}</td>
                            <td class="\${bet.isWin ? 'win' : 'loss'}">\${bet.payoutText}</td>
                            <td class="\${bet.isWin ? 'win' : 'loss'}">$\${bet.payoutUSD.toFixed(2)}</td>
                            <td>\${bet.isWin ? '✅ WIN' : '❌ LOSS'}</td>
                        </tr>
                    \`).join('');
                    
                    document.getElementById('betsBody').innerHTML = rows || '<tr><td colspan="9">No bets yet</td></tr>';
                }
                
                function filterBets() {
                    const filter = document.getElementById('userFilter').value.toLowerCase();
                    const filtered = filter ? allBets.filter(bet => bet.username.toLowerCase().includes(filter)) : allBets;
                    displayBets(filtered);
                }
                
                async function loadUsers() {
                    const res = await fetch('/api/users');
                    const users = await res.json();
                    
                    const rows = users.slice(0, 50).map(user => \`
                        <tr>
                            <td><strong>\${user.username}</strong></td>
                            <td>\${user.totalBets}</td>
                            <td>$\${user.totalWageredUSD.toFixed(2)}</td>
                            <td class="\${user.totalProfitUSD >= 0 ? 'win' : 'loss'}">$\${user.totalProfitUSD.toFixed(2)}</td>
                            <td><button onclick="viewUserStats('\${user.username}')">View Stats</button></td>
                        </tr>
                    \`).join('');
                    
                    document.getElementById('usersBody').innerHTML = rows || '<tr><td colspan="5">No users yet</td></tr>';
                }
                
                async function loadTheGoobr() {
                    const res = await fetch('/api/user/TheGoobr/stats');
                    const stats = await res.json();
                    
                    document.getElementById('thegoobrStats').innerHTML = \`
                        <div class="stat-card">
                            <h3>Daily Stats</h3>
                            <div class="value">\${stats.daily.totalBets}</div>
                            <div class="label">Bets today | Win rate: \${stats.daily.winRate.toFixed(1)}%</div>
                            <div class="label">Profit: $\${stats.daily.totalProfitUSD.toFixed(2)}</div>
                        </div>
                        <div class="stat-card">
                            <h3>Weekly Stats</h3>
                            <div class="value">\${stats.weekly.totalBets}</div>
                            <div class="label">Bets this week | Win rate: \${stats.weekly.winRate.toFixed(1)}%</div>
                            <div class="label">Profit: $\${stats.weekly.totalProfitUSD.toFixed(2)}</div>
                        </div>
                        <div class="stat-card">
                            <h3>Monthly Stats</h3>
                            <div class="value">\${stats.monthly.totalBets}</div>
                            <div class="label">Bets this month | Win rate: \${stats.monthly.winRate.toFixed(1)}%</div>
                            <div class="label">Profit: $\${stats.monthly.totalProfitUSD.toFixed(2)}</div>
                        </div>
                    \`;
                    
                    const res2 = await fetch('/api/bets?username=TheGoobr&limit=100');
                    const bets = await res2.json();
                    
                    const rows = bets.map(bet => \`
                        <tr>
                            <td>\${new Date(bet.timestamp).toLocaleTimeString()}</td>
                            <td>\${bet.game}</td>
                            <td>\${bet.betAmountText} \${bet.currency}</td>
                            <td>$\${bet.betAmountUSD.toFixed(2)}</td>
                            <td>\${bet.multiplierText}</td>
                            <td class="\${bet.isWin ? 'win' : 'loss'}">$\${bet.payoutUSD.toFixed(2)}</td>
                            <td>\${bet.isWin ? '✅ WIN' : '❌ LOSS'}</td>
                        </tr>
                    \`).join('');
                    
                    document.getElementById('thegoobrBody').innerHTML = rows || '<tr><td colspan="7">No bets yet</td></tr>';
                }
                
                async function loadTrackedUsers() {
                    const res = await fetch('/api/tracked-users');
                    trackedUsers = await res.json();
                    
                    // Update dynamic tabs
                    const dynamicTabsHtml = trackedUsers.map(user => \`
                        <div class="tab\${currentTab === user.username ? ' active' : ''}" onclick="switchTab('\${user.username}')">\${user.username}</div>
                    \`).join('');
                    document.getElementById('dynamicTabs').innerHTML = dynamicTabsHtml;
                    
                    // Create tab content for each tracked user
                    const tabsContainer = document.getElementById('trackedUserTabs');
                    const tabsHtml = trackedUsers.map(user => \`
                        <div id="user-\${user.username}" class="tracked-user-tab" style="display:\${currentTab === user.username ? 'block' : 'none'};">
                            <h2>📊 \${user.username} - Lifetime Stats</h2>
                            <div class="stat-card" style="margin-bottom: 20px;">
                                <h3>Tracking Information</h3>
                                <div class="label">Tracking since: \${new Date(user.trackingSince).toLocaleString()}</div>
                                <div class="label">Total Lifetime Bets: <span class="value">\${user.totalBets}</span></div>
                                <div class="label">⚠️ These bets are stored permanently and never deleted</div>
                            </div>
                            <div class="stats-grid" id="stats-\${user.username}"></div>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Time</th>
                                        <th>Game</th>
                                        <th>Bet Amount</th>
                                        <th>USD</th>
                                        <th>Multiplier</th>
                                        <th>Payout USD</th>
                                        <th>Result</th>
                                    </tr>
                                </thead>
                                <tbody id="bets-\${user.username}"></tbody>
                            </table>
                        </div>
                    \`).join('');
                    tabsContainer.innerHTML = tabsHtml;
                    
                    // Update admin panel
                    const adminRows = trackedUsers.map(user => \`
                        <tr>
                            <td><strong>\${user.username}</strong></td>
                            <td>\${user.totalBets}</td>
                            <td style="font-family: monospace; font-size: 11px;">\${user.webhookUrl}</td>
                            <td>\${new Date(user.trackingSince).toLocaleString()}</td>
                            <td><button onclick="removeTrackedUser('\${user.username}')">Remove</button></td>
                        </tr>
                    \`).join('');
                    document.getElementById('trackedUsersBody').innerHTML = adminRows || '<tr><td colspan="5">No tracked users yet</td></tr>';
                }
                
                async function loadTrackedUserData(username) {
                    const res = await fetch(\`/api/tracked-users/\${username}/bets\`);
                    const data = await res.json();
                    
                    const res2 = await fetch(\`/api/user/\${username}/stats\`);
                    const stats = await res2.json();
                    
                    document.getElementById(\`stats-\${username}\`).innerHTML = \`
                        <div class="stat-card">
                            <h3>All Time Stats</h3>
                            <div class="value">\${stats.allTime.totalBets || 0}</div>
                            <div class="label">Total Bets</div>
                            <div class="label">Wagered: $\${(stats.allTime.totalWageredUSD || 0).toFixed(2)}</div>
                            <div class="label">Profit: $\${(stats.allTime.totalProfitUSD || 0).toFixed(2)}</div>
                        </div>
                        <div class="stat-card">
                            <h3>Daily Stats</h3>
                            <div class="value">\${stats.daily.totalBets}</div>
                            <div class="label">Bets today | Win rate: \${stats.daily.winRate.toFixed(1)}%</div>
                            <div class="label">Profit: $\${stats.daily.totalProfitUSD.toFixed(2)}</div>
                        </div>
                        <div class="stat-card">
                            <h3>Weekly Stats</h3>
                            <div class="value">\${stats.weekly.totalBets}</div>
                            <div class="label">Bets this week | Win rate: \${stats.weekly.winRate.toFixed(1)}%</div>
                            <div class="label">Profit: $\${stats.weekly.totalProfitUSD.toFixed(2)}</div>
                        </div>
                        <div class="stat-card">
                            <h3>Monthly Stats</h3>
                            <div class="value">\${stats.monthly.totalBets}</div>
                            <div class="label">Bets this month | Win rate: \${stats.monthly.winRate.toFixed(1)}%</div>
                            <div class="label">Profit: $\${stats.monthly.totalProfitUSD.toFixed(2)}</div>
                        </div>
                    \`;
                    
                    const rows = data.bets.map(bet => \`
                        <tr>
                            <td>\${new Date(bet.timestamp).toLocaleTimeString()}</td>
                            <td>\${bet.game}</td>
                            <td>\${bet.betAmountText} \${bet.currency}</td>
                            <td>$\${bet.betAmountUSD.toFixed(2)}</td>
                            <td>\${bet.multiplierText}</td>
                            <td class="\${bet.isWin ? 'win' : 'loss'}">$\${bet.payoutUSD.toFixed(2)}</td>
                            <td>\${bet.isWin ? '✅ WIN' : '❌ LOSS'}</td>
                        </tr>
                    \`).join('');
                    
                    document.getElementById(\`bets-\${username}\`).innerHTML = rows || '<tr><td colspan="7">No bets yet</td></tr>';
                }
                
                async function addTrackedUser() {
                    const username = document.getElementById('newUsername').value.trim();
                    const webhookUrl = document.getElementById('newWebhookUrl').value.trim();
                    
                    if (!username) {
                        alert('Please enter a username');
                        return;
                    }
                    
                    if (!webhookUrl) {
                        alert('Please enter a Discord webhook URL');
                        return;
                    }
                    
                    if (!webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
                        alert('Please enter a valid Discord webhook URL (must start with https://discord.com/api/webhooks/)');
                        return;
                    }
                    
                    const res = await fetch('/api/tracked-users', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, webhookUrl, password: adminPassword })
                    });
                    
                    const result = await res.json();
                    if (result.error) {
                        alert('Error: ' + result.error);
                    } else {
                        alert(result.message);
                        document.getElementById('newUsername').value = '';
                        document.getElementById('newWebhookUrl').value = '';
                        await loadTrackedUsers();
                    }
                }
                
                async function removeTrackedUser(username) {
                    if (!confirm(\`Remove \${username} from tracked users? Their bets will still be in stats but won't be stored permanently anymore.\`)) {
                        return;
                    }
                    
                    const res = await fetch(\`/api/tracked-users/\${username}\`, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ password: adminPassword })
                    });
                    
                    const result = await res.json();
                    if (result.error) {
                        alert('Error: ' + result.error);
                    } else {
                        alert(result.message);
                        await loadTrackedUsers();
                    }
                }
                
                async function loadData() {
                    await loadPrices();
                    await loadTrackedUsers();
                    
                    if (currentTab === 'recent') {
                        await loadBets();
                    } else if (currentTab === 'users') {
                        await loadUsers();
                    } else if (currentTab === 'thegoobr') {
                        await loadTheGoobr();
                    } else if (currentTab === 'admin') {
                        // Admin panel already loaded by loadTrackedUsers
                    } else {
                        // Load tracked user data
                        await loadTrackedUserData(currentTab);
                    }
                }
                
                function viewUserStats(username) {
                    alert('User stats for ' + username + ' - Feature coming soon!');
                }
                
                loadData();
                setInterval(loadData, 3000);
            </script>
        </body>
        </html>
    `);
});

startScraper(handleBet);

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`🤖 Scraper starting...`);
});
