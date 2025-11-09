const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { startScraper, stopScraper, getCryptoPrices } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const TARGET_USERNAME = 'TheGoobr';

const bets = [];
const userStats = {};

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

async function sendToDiscord(bet) {
    if (!DISCORD_WEBHOOK_URL) return;
    
    const color = bet.isWin ? 0x00ff00 : 0xff0000;
    
    const embed = {
        title: `🎲 ${bet.isWin ? '✅ WIN' : '❌ LOSS'} - ${bet.username}`,
        color: color,
        fields: [
            {
                name: 'Game',
                value: bet.game || 'Unknown',
                inline: true
            },
            {
                name: 'Bet Amount',
                value: `${bet.betAmountText} ${bet.currency}\n($${bet.betAmountUSD.toFixed(2)} USD)`,
                inline: true
            },
            {
                name: 'Multiplier',
                value: bet.multiplierText || 'Unknown',
                inline: true
            },
            {
                name: 'Payout',
                value: `${bet.payoutText} ${bet.currency}\n($${bet.payoutUSD.toFixed(2)} USD)`,
                inline: true
            },
            {
                name: 'Time',
                value: new Date(bet.timestamp).toLocaleString(),
                inline: false
            }
        ],
        timestamp: new Date(bet.timestamp).toISOString()
    };
    
    try {
        await axios.post(DISCORD_WEBHOOK_URL, { embeds: [embed] });
        console.log(`✅ Sent ${bet.username} bet to Discord`);
    } catch (error) {
        console.error('Error sending to Discord:', error.message);
    }
}

function handleBet(betData) {
    bets.push(betData);
    
    // Keep unlimited bets - text is lightweight
    // Only trim if we hit 100k to prevent extreme memory issues
    if (bets.length > 100000) {
        bets.splice(0, 50000);
    }
    
    updateUserStats(betData);
    
    if (betData.username === TARGET_USERNAME) {
        sendToDiscord(betData);
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

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Shuffle.com Live Bet Tracker</title>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0a0e27; color: #fff; padding: 20px; }
                .container { max-width: 1600px; margin: 0 auto; }
                h1 { color: #00ff88; margin-bottom: 10px; }
                .status { color: #888; margin-bottom: 20px; }
                .prices { background: #1a1f3a; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
                .prices h3 { color: #00ff88; margin-bottom: 10px; }
                .price-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; }
                .price-item { background: #0a0e27; padding: 10px; border-radius: 4px; text-align: center; }
                .price-item .currency { font-weight: bold; color: #00ff88; }
                .price-item .value { font-size: 12px; color: #aaa; }
                .tabs { display: flex; gap: 10px; margin-bottom: 20px; }
                .tab { background: #1a1f3a; color: #00ff88; border: 2px solid #00ff88; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-weight: bold; transition: all 0.3s; }
                .tab.active, .tab:hover { background: #00ff88; color: #0a0e27; }
                table { width: 100%; border-collapse: collapse; background: #1a1f3a; border-radius: 8px; overflow: hidden; }
                th { background: #00ff88; color: #0a0e27; padding: 12px; text-align: left; font-weight: bold; position: sticky; top: 0; }
                td { padding: 10px; border-bottom: 1px solid #2a2f4a; }
                tr:hover { background: #2a2f4a; }
                .win { color: #00ff88; }
                .loss { color: #ff4444; }
                .highlight { background: #2d3748; }
                button { background: #00ff88; color: #0a0e27; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-weight: bold; margin-right: 10px; }
                button:hover { background: #00dd77; }
                .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin-bottom: 20px; }
                .stat-card { background: #1a1f3a; padding: 20px; border-radius: 8px; border-left: 4px solid #00ff88; }
                .stat-card h3 { color: #00ff88; font-size: 14px; margin-bottom: 10px; }
                .stat-card .value { font-size: 24px; font-weight: bold; }
                .stat-card .label { font-size: 12px; color: #888; margin-top: 5px; }
                input { background: #1a1f3a; color: #fff; border: 1px solid #00ff88; padding: 10px; border-radius: 4px; margin-bottom: 15px; width: 300px; }
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
                
                <div class="tabs">
                    <div class="tab active" onclick="switchTab('recent')">Recent Bets</div>
                    <div class="tab" onclick="switchTab('users')">Top Users</div>
                    <div class="tab" onclick="switchTab('thegoobr')">TheGoobr Stats</div>
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
            </div>
            
            <script>
                let currentTab = 'recent';
                let allBets = [];
                
                function switchTab(tab) {
                    currentTab = tab;
                    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                    event.target.classList.add('active');
                    
                    document.getElementById('recentTab').style.display = tab === 'recent' ? 'block' : 'none';
                    document.getElementById('usersTab').style.display = tab === 'users' ? 'block' : 'none';
                    document.getElementById('thegoobrTab').style.display = tab === 'thegoobr' ? 'block' : 'none';
                    
                    loadData();
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
                
                async function loadData() {
                    await loadPrices();
                    if (currentTab === 'recent') {
                        await loadBets();
                    } else if (currentTab === 'users') {
                        await loadUsers();
                    } else if (currentTab === 'thegoobr') {
                        await loadTheGoobr();
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
