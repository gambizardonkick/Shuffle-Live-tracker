const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const AUTH_TOKEN = 'shuffle-tracker-2024';
const TARGET_USERNAME = 'TheGoobr';

const bets = [];
const betIds = new Set();
const stats = {
    all: { daily: {}, weekly: {}, monthly: {} },
    thegoobr: { daily: {}, weekly: {}, monthly: {} }
};

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

function parseAmount(amountStr) {
    const cleaned = amountStr.replace(/[^0-9.-]/g, '');
    return parseFloat(cleaned) || 0;
}

function updateStats(bet, category) {
    const dayKey = getDateKey(bet.timestamp);
    const weekKey = getWeekKey(bet.timestamp);
    const monthKey = getMonthKey(bet.timestamp);
    
    const statsObj = stats[category];
    
    if (!statsObj.daily[dayKey]) {
        statsObj.daily[dayKey] = { totalBets: 0, totalWagered: 0, totalProfit: 0, games: {}, users: {} };
    }
    if (!statsObj.weekly[weekKey]) {
        statsObj.weekly[weekKey] = { totalBets: 0, totalWagered: 0, totalProfit: 0, games: {}, users: {} };
    }
    if (!statsObj.monthly[monthKey]) {
        statsObj.monthly[monthKey] = { totalBets: 0, totalWagered: 0, totalProfit: 0, games: {}, users: {} };
    }
    
    const amount = parseAmount(bet.amount);
    const profit = parseAmount(bet.profit);
    
    statsObj.daily[dayKey].totalBets++;
    statsObj.daily[dayKey].totalWagered += amount;
    statsObj.daily[dayKey].totalProfit += profit;
    statsObj.daily[dayKey].games[bet.game] = (statsObj.daily[dayKey].games[bet.game] || 0) + 1;
    statsObj.daily[dayKey].users[bet.username] = (statsObj.daily[dayKey].users[bet.username] || 0) + 1;
    
    statsObj.weekly[weekKey].totalBets++;
    statsObj.weekly[weekKey].totalWagered += amount;
    statsObj.weekly[weekKey].totalProfit += profit;
    statsObj.weekly[weekKey].games[bet.game] = (statsObj.weekly[weekKey].games[bet.game] || 0) + 1;
    statsObj.weekly[weekKey].users[bet.username] = (statsObj.weekly[weekKey].users[bet.username] || 0) + 1;
    
    statsObj.monthly[monthKey].totalBets++;
    statsObj.monthly[monthKey].totalWagered += amount;
    statsObj.monthly[monthKey].totalProfit += profit;
    statsObj.monthly[monthKey].games[bet.game] = (statsObj.monthly[monthKey].games[bet.game] || 0) + 1;
    statsObj.monthly[monthKey].users[bet.username] = (statsObj.monthly[monthKey].users[bet.username] || 0) + 1;
}

async function sendToDiscord(bet) {
    if (!DISCORD_WEBHOOK_URL) {
        console.error('Discord webhook URL not configured');
        return;
    }
    
    const embed = {
        title: `🎲 New Bet from ${TARGET_USERNAME}`,
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
        console.log(`✅ Sent ${TARGET_USERNAME} bet to Discord`);
    } catch (error) {
        console.error('Error sending to Discord:', error.message);
    }
}

async function sendStatsToDiscord(period, category = 'thegoobr') {
    if (!DISCORD_WEBHOOK_URL) return;
    
    let data, title;
    const now = new Date();
    const statsObj = stats[category];
    
    if (period === 'daily') {
        const key = getDateKey(now);
        data = statsObj.daily[key];
        title = `📊 Daily Stats for ${category === 'thegoobr' ? TARGET_USERNAME : 'All Users'} - ${key}`;
    } else if (period === 'weekly') {
        const key = getWeekKey(now);
        data = statsObj.weekly[key];
        title = `📊 Weekly Stats for ${category === 'thegoobr' ? TARGET_USERNAME : 'All Users'} - ${key}`;
    } else if (period === 'monthly') {
        const key = getMonthKey(now);
        data = statsObj.monthly[key];
        title = `📊 Monthly Stats for ${category === 'thegoobr' ? TARGET_USERNAME : 'All Users'} - ${key}`;
    }
    
    if (!data) {
        console.log('No data available for', period, category);
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

app.post('/api/bet', async (req, res) => {
    try {
        const authToken = req.headers['x-auth-token'];
        if (authToken !== AUTH_TOKEN) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        
        const betData = req.body;
        
        if (betIds.has(betData.betId)) {
            return res.json({ success: true, message: 'Bet already tracked (duplicate)' });
        }
        
        console.log('✅ New bet:', betData.username, betData.amount);
        
        betIds.add(betData.betId);
        bets.push(betData);
        
        if (betIds.size > 5000) {
            const toDelete = Array.from(betIds).slice(0, 1000);
            toDelete.forEach(id => betIds.delete(id));
        }
        
        updateStats(betData, 'all');
        
        if (betData.username === TARGET_USERNAME) {
            updateStats(betData, 'thegoobr');
            await sendToDiscord(betData);
        }
        
        res.json({ success: true, message: 'Bet tracked' });
    } catch (error) {
        console.error('Error processing bet:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/stats/:period', (req, res) => {
    const period = req.params.period;
    const category = req.query.category || 'all';
    const now = new Date();
    
    const statsObj = stats[category];
    let data;
    
    if (period === 'daily') {
        data = statsObj.daily[getDateKey(now)];
    } else if (period === 'weekly') {
        data = statsObj.weekly[getWeekKey(now)];
    } else if (period === 'monthly') {
        data = statsObj.monthly[getMonthKey(now)];
    }
    
    res.json(data || { totalBets: 0, totalWagered: 0, totalProfit: 0, games: {}, users: {} });
});

app.post('/api/stats/:period/send', async (req, res) => {
    const period = req.params.period;
    const category = req.query.category || 'thegoobr';
    await sendStatsToDiscord(period, category);
    res.json({ success: true });
});

app.get('/api/bets', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const username = req.query.username;
    
    let filteredBets = bets;
    if (username) {
        filteredBets = bets.filter(b => b.username === username);
    }
    
    res.json(filteredBets.slice(-limit).reverse());
});

app.get('/api/stats/all', (req, res) => {
    const now = new Date();
    res.json({
        all: {
            daily: stats.all.daily[getDateKey(now)] || { totalBets: 0, totalWagered: 0, totalProfit: 0, games: {}, users: {} },
            weekly: stats.all.weekly[getWeekKey(now)] || { totalBets: 0, totalWagered: 0, totalProfit: 0, games: {}, users: {} },
            monthly: stats.all.monthly[getMonthKey(now)] || { totalBets: 0, totalWagered: 0, totalProfit: 0, games: {}, users: {} }
        },
        thegoobr: {
            daily: stats.thegoobr.daily[getDateKey(now)] || { totalBets: 0, totalWagered: 0, totalProfit: 0, games: {}, users: {} },
            weekly: stats.thegoobr.weekly[getWeekKey(now)] || { totalBets: 0, totalWagered: 0, totalProfit: 0, games: {}, users: {} },
            monthly: stats.thegoobr.monthly[getMonthKey(now)] || { totalBets: 0, totalWagered: 0, totalProfit: 0, games: {}, users: {} }
        }
    });
});

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Shuffle.com Bet Tracker</title>
            <style>
                body { font-family: Arial, sans-serif; max-width: 1400px; margin: 0 auto; padding: 20px; background: #1a1a2e; color: #eee; }
                h1 { color: #00ff00; }
                .tabs { display: flex; gap: 10px; margin: 20px 0; }
                .tab { background: #16213e; color: #00ff00; border: 2px solid #00ff00; padding: 10px 20px; border-radius: 4px; cursor: pointer; }
                .tab.active { background: #00ff00; color: #000; }
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
                .highlight { background: #2d3748; }
                .filter { margin: 10px 0; }
                input { padding: 8px; background: #16213e; color: #eee; border: 1px solid #00ff00; border-radius: 4px; }
            </style>
        </head>
        <body>
            <h1>🎲 Shuffle.com Bet Tracker</h1>
            
            <div class="tabs">
                <div class="tab active" onclick="switchTab('all')">All Bets</div>
                <div class="tab" onclick="switchTab('thegoobr')">TheGoobr Only</div>
            </div>
            
            <div>
                <button onclick="sendStats('daily')">Send Daily Stats to Discord</button>
                <button onclick="sendStats('weekly')">Send Weekly Stats to Discord</button>
                <button onclick="sendStats('monthly')">Send Monthly Stats to Discord</button>
                <button onclick="loadData()">Refresh</button>
            </div>
            
            <div class="stats" id="stats"></div>
            
            <div class="bets">
                <h2>Recent Bets (<span id="betCount">0</span>)</h2>
                <div class="filter">
                    <input type="text" id="usernameFilter" placeholder="Filter by username..." onkeyup="filterBets()">
                </div>
                <table id="betsTable">
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>Username</th>
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
                let currentTab = 'all';
                let allBets = [];
                
                function switchTab(tab) {
                    currentTab = tab;
                    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                    event.target.classList.add('active');
                    loadData();
                }
                
                async function loadData() {
                    await Promise.all([loadStats(), loadBets()]);
                }
                
                async function loadStats() {
                    const res = await fetch('/api/stats/all');
                    const data = await res.json();
                    
                    const statsData = data[currentTab];
                    
                    const statsHtml = \`
                        <div class="stat-card">
                            <h2>📅 Daily Stats</h2>
                            <div class="stat-item"><strong>Total Bets:</strong> \${statsData.daily.totalBets}</div>
                            <div class="stat-item"><strong>Total Wagered:</strong> $\${statsData.daily.totalWagered.toFixed(2)}</div>
                            <div class="stat-item"><strong>Total Profit:</strong> <span class="\${statsData.daily.totalProfit >= 0 ? 'positive' : 'negative'}">$\${statsData.daily.totalProfit.toFixed(2)}</span></div>
                            <div class="stat-item"><strong>Unique Users:</strong> \${Object.keys(statsData.daily.users || {}).length}</div>
                        </div>
                        <div class="stat-card">
                            <h2>📊 Weekly Stats</h2>
                            <div class="stat-item"><strong>Total Bets:</strong> \${statsData.weekly.totalBets}</div>
                            <div class="stat-item"><strong>Total Wagered:</strong> $\${statsData.weekly.totalWagered.toFixed(2)}</div>
                            <div class="stat-item"><strong>Total Profit:</strong> <span class="\${statsData.weekly.totalProfit >= 0 ? 'positive' : 'negative'}">$\${statsData.weekly.totalProfit.toFixed(2)}</span></div>
                            <div class="stat-item"><strong>Unique Users:</strong> \${Object.keys(statsData.weekly.users || {}).length}</div>
                        </div>
                        <div class="stat-card">
                            <h2>📈 Monthly Stats</h2>
                            <div class="stat-item"><strong>Total Bets:</strong> \${statsData.monthly.totalBets}</div>
                            <div class="stat-item"><strong>Total Wagered:</strong> $\${statsData.monthly.totalWagered.toFixed(2)}</div>
                            <div class="stat-item"><strong>Total Profit:</strong> <span class="\${statsData.monthly.totalProfit >= 0 ? 'positive' : 'negative'}">$\${statsData.monthly.totalProfit.toFixed(2)}</span></div>
                            <div class="stat-item"><strong>Unique Users:</strong> \${Object.keys(statsData.monthly.users || {}).length}</div>
                        </div>
                    \`;
                    
                    document.getElementById('stats').innerHTML = statsHtml;
                }
                
                async function loadBets() {
                    const url = currentTab === 'thegoobr' ? '/api/bets?username=TheGoobr&limit=100' : '/api/bets?limit=100';
                    const res = await fetch(url);
                    allBets = await res.json();
                    
                    displayBets(allBets);
                }
                
                function displayBets(betsToShow) {
                    document.getElementById('betCount').textContent = betsToShow.length;
                    
                    const rows = betsToShow.map(bet => \`
                        <tr class="\${bet.username === 'TheGoobr' ? 'highlight' : ''}">
                            <td>\${new Date(bet.timestamp).toLocaleString()}</td>
                            <td><strong>\${bet.username}</strong></td>
                            <td>\${bet.game}</td>
                            <td>\${bet.amount}</td>
                            <td>\${bet.multiplier}</td>
                            <td>\${bet.profit}</td>
                        </tr>
                    \`).join('');
                    
                    document.getElementById('betsBody').innerHTML = rows || '<tr><td colspan="6">No bets yet</td></tr>';
                }
                
                function filterBets() {
                    const filter = document.getElementById('usernameFilter').value.toLowerCase();
                    if (!filter) {
                        displayBets(allBets);
                        return;
                    }
                    
                    const filtered = allBets.filter(bet => bet.username.toLowerCase().includes(filter));
                    displayBets(filtered);
                }
                
                async function sendStats(period) {
                    await fetch(\`/api/stats/\${period}/send?category=\${currentTab}\`, { method: 'POST' });
                    alert(\`\${period.charAt(0).toUpperCase() + period.slice(1)} stats sent to Discord!\`);
                }
                
                loadData();
                setInterval(loadData, 10000);
            </script>
        </body>
        </html>
    `);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`🎲 Tracking ALL bets, Discord notifications for: ${TARGET_USERNAME}`);
    console.log(`📨 Discord webhook configured: ${DISCORD_WEBHOOK_URL ? 'Yes' : 'No'}`);
});
