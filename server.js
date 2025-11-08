const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Discord webhook URL from environment
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// Storage for bet tracking
const bets = [];
const stats = {
    daily: {},
    weekly: {},
    monthly: {}
};

// Utility functions
function getDateKey(date) {
    const d = new Date(date);
    return d.toISOString().split('T')[0]; // YYYY-MM-DD
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

function parseAmount(amountStr) {
    // Remove currency symbols and parse
    const cleaned = amountStr.replace(/[^0-9.-]/g, '');
    return parseFloat(cleaned) || 0;
}

// Update stats
function updateStats(bet) {
    const dayKey = getDateKey(bet.timestamp);
    const weekKey = getWeekKey(bet.timestamp);
    const monthKey = getMonthKey(bet.timestamp);
    
    // Initialize if needed
    if (!stats.daily[dayKey]) {
        stats.daily[dayKey] = { totalBets: 0, totalWagered: 0, totalProfit: 0, games: {} };
    }
    if (!stats.weekly[weekKey]) {
        stats.weekly[weekKey] = { totalBets: 0, totalWagered: 0, totalProfit: 0, games: {} };
    }
    if (!stats.monthly[monthKey]) {
        stats.monthly[monthKey] = { totalBets: 0, totalWagered: 0, totalProfit: 0, games: {} };
    }
    
    const amount = parseAmount(bet.amount);
    const profit = parseAmount(bet.profit);
    
    // Update daily stats
    stats.daily[dayKey].totalBets++;
    stats.daily[dayKey].totalWagered += amount;
    stats.daily[dayKey].totalProfit += profit;
    stats.daily[dayKey].games[bet.game] = (stats.daily[dayKey].games[bet.game] || 0) + 1;
    
    // Update weekly stats
    stats.weekly[weekKey].totalBets++;
    stats.weekly[weekKey].totalWagered += amount;
    stats.weekly[weekKey].totalProfit += profit;
    stats.weekly[weekKey].games[bet.game] = (stats.weekly[weekKey].games[bet.game] || 0) + 1;
    
    // Update monthly stats
    stats.monthly[monthKey].totalBets++;
    stats.monthly[monthKey].totalWagered += amount;
    stats.monthly[monthKey].totalProfit += profit;
    stats.monthly[monthKey].games[bet.game] = (stats.monthly[monthKey].games[bet.game] || 0) + 1;
}

// Send to Discord
async function sendToDiscord(bet) {
    if (!DISCORD_WEBHOOK_URL) {
        console.error('Discord webhook URL not configured');
        return;
    }
    
    const embed = {
        title: '🎲 New Bet from TheGoobr',
        color: 0x00ff00,
        fields: [
            {
                name: 'Game',
                value: bet.game || 'Unknown',
                inline: true
            },
            {
                name: 'Amount',
                value: bet.amount || 'Unknown',
                inline: true
            },
            {
                name: 'Multiplier',
                value: bet.multiplier || 'Unknown',
                inline: true
            },
            {
                name: 'Profit',
                value: bet.profit || 'Unknown',
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
        await axios.post(DISCORD_WEBHOOK_URL, {
            embeds: [embed]
        });
        console.log('Bet sent to Discord');
    } catch (error) {
        console.error('Error sending to Discord:', error.message);
    }
}

// Send stats to Discord
async function sendStatsToDiscord(period) {
    if (!DISCORD_WEBHOOK_URL) return;
    
    let data, title;
    const now = new Date();
    
    if (period === 'daily') {
        const key = getDateKey(now);
        data = stats.daily[key];
        title = `📊 Daily Stats for ${key}`;
    } else if (period === 'weekly') {
        const key = getWeekKey(now);
        data = stats.weekly[key];
        title = `📊 Weekly Stats for ${key}`;
    } else if (period === 'monthly') {
        const key = getMonthKey(now);
        data = stats.monthly[key];
        title = `📊 Monthly Stats for ${key}`;
    }
    
    if (!data) {
        console.log('No data available for', period);
        return;
    }
    
    const gamesText = Object.entries(data.games)
        .map(([game, count]) => `${game}: ${count}`)
        .join('\n') || 'No games';
    
    const embed = {
        title: title,
        color: 0x0099ff,
        fields: [
            {
                name: 'Total Bets',
                value: String(data.totalBets),
                inline: true
            },
            {
                name: 'Total Wagered',
                value: `$${data.totalWagered.toFixed(2)}`,
                inline: true
            },
            {
                name: 'Total Profit',
                value: `$${data.totalProfit.toFixed(2)}`,
                inline: true
            },
            {
                name: 'Games Played',
                value: gamesText,
                inline: false
            }
        ],
        timestamp: new Date().toISOString()
    };
    
    try {
        await axios.post(DISCORD_WEBHOOK_URL, {
            embeds: [embed]
        });
        console.log(`${period} stats sent to Discord`);
    } catch (error) {
        console.error('Error sending stats to Discord:', error.message);
    }
}

// API Routes
app.post('/api/bet', async (req, res) => {
    try {
        const betData = req.body;
        console.log('Received bet:', betData);
        
        // Store bet
        bets.push(betData);
        
        // Update stats
        updateStats(betData);
        
        // Send to Discord
        await sendToDiscord(betData);
        
        res.json({ success: true, message: 'Bet tracked' });
    } catch (error) {
        console.error('Error processing bet:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/stats/:period', (req, res) => {
    const period = req.params.period;
    const now = new Date();
    
    let data;
    if (period === 'daily') {
        data = stats.daily[getDateKey(now)];
    } else if (period === 'weekly') {
        data = stats.weekly[getWeekKey(now)];
    } else if (period === 'monthly') {
        data = stats.monthly[getMonthKey(now)];
    }
    
    res.json(data || { totalBets: 0, totalWagered: 0, totalProfit: 0, games: {} });
});

app.post('/api/stats/:period/send', async (req, res) => {
    const period = req.params.period;
    await sendStatsToDiscord(period);
    res.json({ success: true });
});

app.get('/api/bets', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    res.json(bets.slice(-limit).reverse());
});

app.get('/api/stats/all', (req, res) => {
    const now = new Date();
    res.json({
        daily: stats.daily[getDateKey(now)] || { totalBets: 0, totalWagered: 0, totalProfit: 0, games: {} },
        weekly: stats.weekly[getWeekKey(now)] || { totalBets: 0, totalWagered: 0, totalProfit: 0, games: {} },
        monthly: stats.monthly[getMonthKey(now)] || { totalBets: 0, totalWagered: 0, totalProfit: 0, games: {} }
    });
});

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Shuffle.com Bet Tracker</title>
            <style>
                body { font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; background: #1a1a2e; color: #eee; }
                h1 { color: #00ff00; }
                .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin: 20px 0; }
                .stat-card { background: #16213e; padding: 20px; border-radius: 8px; border: 2px solid #00ff00; }
                .stat-card h2 { margin-top: 0; color: #00ff00; }
                .stat-item { margin: 10px 0; }
                .bets { margin-top: 30px; }
                table { width: 100%; border-collapse: collapse; }
                th, td { padding: 10px; text-align: left; border-bottom: 1px solid #333; }
                th { background: #16213e; color: #00ff00; }
                button { background: #00ff00; color: #000; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; margin: 5px; }
                button:hover { background: #00cc00; }
                .positive { color: #00ff00; }
                .negative { color: #ff0000; }
            </style>
        </head>
        <body>
            <h1>🎲 Shuffle.com Bet Tracker - TheGoobr</h1>
            
            <div>
                <button onclick="sendStats('daily')">Send Daily Stats to Discord</button>
                <button onclick="sendStats('weekly')">Send Weekly Stats to Discord</button>
                <button onclick="sendStats('monthly')">Send Monthly Stats to Discord</button>
                <button onclick="loadStats()">Refresh Stats</button>
            </div>
            
            <div class="stats" id="stats"></div>
            
            <div class="bets">
                <h2>Recent Bets</h2>
                <table id="betsTable">
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>Game</th>
                            <th>Amount</th>
                            <th>Multiplier</th>
                            <th>Profit</th>
                        </tr>
                    </thead>
                    <tbody id="betsBody"></tbody>
                </table>
            </div>
            
            <script>
                async function loadStats() {
                    const res = await fetch('/api/stats/all');
                    const data = await res.json();
                    
                    const statsHtml = \`
                        <div class="stat-card">
                            <h2>📅 Daily Stats</h2>
                            <div class="stat-item"><strong>Total Bets:</strong> \${data.daily.totalBets}</div>
                            <div class="stat-item"><strong>Total Wagered:</strong> $\${data.daily.totalWagered.toFixed(2)}</div>
                            <div class="stat-item"><strong>Total Profit:</strong> <span class="\${data.daily.totalProfit >= 0 ? 'positive' : 'negative'}">$\${data.daily.totalProfit.toFixed(2)}</span></div>
                            <div class="stat-item"><strong>Games:</strong> \${Object.keys(data.daily.games).length}</div>
                        </div>
                        <div class="stat-card">
                            <h2>📊 Weekly Stats</h2>
                            <div class="stat-item"><strong>Total Bets:</strong> \${data.weekly.totalBets}</div>
                            <div class="stat-item"><strong>Total Wagered:</strong> $\${data.weekly.totalWagered.toFixed(2)}</div>
                            <div class="stat-item"><strong>Total Profit:</strong> <span class="\${data.weekly.totalProfit >= 0 ? 'positive' : 'negative'}">$\${data.weekly.totalProfit.toFixed(2)}</span></div>
                            <div class="stat-item"><strong>Games:</strong> \${Object.keys(data.weekly.games).length}</div>
                        </div>
                        <div class="stat-card">
                            <h2>📈 Monthly Stats</h2>
                            <div class="stat-item"><strong>Total Bets:</strong> \${data.monthly.totalBets}</div>
                            <div class="stat-item"><strong>Total Wagered:</strong> $\${data.monthly.totalWagered.toFixed(2)}</div>
                            <div class="stat-item"><strong>Total Profit:</strong> <span class="\${data.monthly.totalProfit >= 0 ? 'positive' : 'negative'}">$\${data.monthly.totalProfit.toFixed(2)}</span></div>
                            <div class="stat-item"><strong>Games:</strong> \${Object.keys(data.monthly.games).length}</div>
                        </div>
                    \`;
                    
                    document.getElementById('stats').innerHTML = statsHtml;
                }
                
                async function loadBets() {
                    const res = await fetch('/api/bets?limit=20');
                    const bets = await res.json();
                    
                    const rows = bets.map(bet => \`
                        <tr>
                            <td>\${new Date(bet.timestamp).toLocaleString()}</td>
                            <td>\${bet.game}</td>
                            <td>\${bet.amount}</td>
                            <td>\${bet.multiplier}</td>
                            <td>\${bet.profit}</td>
                        </tr>
                    \`).join('');
                    
                    document.getElementById('betsBody').innerHTML = rows || '<tr><td colspan="5">No bets yet</td></tr>';
                }
                
                async function sendStats(period) {
                    await fetch(\`/api/stats/\${period}/send\`, { method: 'POST' });
                    alert(\`\${period.charAt(0).toUpperCase() + period.slice(1)} stats sent to Discord!\`);
                }
                
                // Load initial data
                loadStats();
                loadBets();
                
                // Auto-refresh every 10 seconds
                setInterval(() => {
                    loadStats();
                    loadBets();
                }, 10000);
            </script>
        </body>
        </html>
    `);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`🎲 Tracking bets for: TheGoobr`);
    console.log(`📨 Discord webhook configured: ${DISCORD_WEBHOOK_URL ? 'Yes' : 'No'}`);
});
