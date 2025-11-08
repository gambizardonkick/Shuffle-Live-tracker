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

function initStats() {
    return {
        totalBets: 0,
        totalWagered: 0,
        totalPayout: 0,
        totalProfit: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        averageBet: 0,
        averageMultiplier: 0,
        averagePayout: 0,
        biggestWin: 0,
        biggestLoss: 0,
        games: {},
        users: {},
        multipliers: []
    };
}

function updateStats(bet, category) {
    const dayKey = getDateKey(bet.timestamp);
    const weekKey = getWeekKey(bet.timestamp);
    const monthKey = getMonthKey(bet.timestamp);
    
    const statsObj = stats[category];
    
    if (!statsObj.daily[dayKey]) statsObj.daily[dayKey] = initStats();
    if (!statsObj.weekly[weekKey]) statsObj.weekly[weekKey] = initStats();
    if (!statsObj.monthly[monthKey]) statsObj.monthly[monthKey] = initStats();
    
    const betAmount = bet.betAmount || 0;
    const payout = bet.payout || 0;
    const profit = payout;
    const multiplier = bet.multiplier || 0;
    const isWin = profit > 0;
    
    [dayKey, weekKey, monthKey].forEach((key, idx) => {
        const periodStats = idx === 0 ? statsObj.daily[key] : idx === 1 ? statsObj.weekly[key] : statsObj.monthly[key];
        
        periodStats.totalBets++;
        periodStats.totalWagered += betAmount;
        periodStats.totalPayout += isWin ? payout : 0;
        periodStats.totalProfit += profit;
        
        if (isWin) {
            periodStats.wins++;
            if (profit > periodStats.biggestWin) periodStats.biggestWin = profit;
        } else {
            periodStats.losses++;
            if (profit < periodStats.biggestLoss) periodStats.biggestLoss = profit;
        }
        
        periodStats.winRate = periodStats.totalBets > 0 ? (periodStats.wins / periodStats.totalBets * 100) : 0;
        periodStats.averageBet = periodStats.totalBets > 0 ? (periodStats.totalWagered / periodStats.totalBets) : 0;
        periodStats.averagePayout = periodStats.totalBets > 0 ? (periodStats.totalPayout / periodStats.totalBets) : 0;
        
        periodStats.multipliers.push(multiplier);
        const validMultipliers = periodStats.multipliers.filter(m => m > 0);
        periodStats.averageMultiplier = validMultipliers.length > 0 ? 
            (validMultipliers.reduce((a, b) => a + b, 0) / validMultipliers.length) : 0;
        
        periodStats.games[bet.game] = (periodStats.games[bet.game] || 0) + 1;
        periodStats.users[bet.username] = (periodStats.users[bet.username] || 0) + 1;
    });
}

async function sendToDiscord(bet) {
    if (!DISCORD_WEBHOOK_URL) {
        console.error('Discord webhook URL not configured');
        return;
    }
    
    const color = bet.isWin ? 0x00ff00 : 0xff0000;
    const profitText = bet.isWin ? `+${bet.payoutText}` : bet.payoutText;
    
    const embed = {
        title: `🎲 ${bet.isWin ? '✅ WIN' : '❌ LOSS'} - ${TARGET_USERNAME}`,
        color: color,
        fields: [
            {
                name: 'Game',
                value: bet.game || 'Unknown',
                inline: true
            },
            {
                name: 'Bet Amount',
                value: bet.betAmountText || 'Unknown',
                inline: true
            },
            {
                name: 'Multiplier',
                value: bet.multiplierText || 'Unknown',
                inline: true
            },
            {
                name: 'Payout',
                value: profitText || 'Unknown',
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
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([game, count]) => `${game}: ${count}`)
        .join('\n') || 'No games';
    
    const embed = {
        title: title,
        color: data.totalProfit >= 0 ? 0x00ff00 : 0xff0000,
        fields: [
            {
                name: '📊 Overview',
                value: `Bets: ${data.totalBets}\nWins: ${data.wins} | Losses: ${data.losses}\nWin Rate: ${data.winRate.toFixed(1)}%`,
                inline: true
            },
            {
                name: '💰 Money',
                value: `Wagered: $${data.totalWagered.toFixed(2)}\nPayout: $${data.totalPayout.toFixed(2)}\nProfit: $${data.totalProfit.toFixed(2)}`,
                inline: true
            },
            {
                name: '📈 Averages',
                value: `Bet: $${data.averageBet.toFixed(2)}\nMultiplier: ${data.averageMultiplier.toFixed(2)}x\nPayout: $${data.averagePayout.toFixed(2)}`,
                inline: true
            },
            {
                name: '🏆 Records',
                value: `Biggest Win: $${data.biggestWin.toFixed(2)}\nBiggest Loss: $${data.biggestLoss.toFixed(2)}`,
                inline: true
            },
            {
                name: '🎮 Top Games',
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
            return res.json({ success: true, message: 'Duplicate' });
        }
        
        console.log('✅ New bet:', betData.username, betData.game, betData.betAmountText);
        
        betIds.add(betData.betId);
        bets.push(betData);
        
        if (bets.length > 10000) {
            bets.splice(0, 5000);
        }
        
        if (betIds.size > 10000) {
            const toDelete = Array.from(betIds).slice(0, 5000);
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
    
    res.json(data || initStats());
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
            daily: stats.all.daily[getDateKey(now)] || initStats(),
            weekly: stats.all.weekly[getWeekKey(now)] || initStats(),
            monthly: stats.all.monthly[getMonthKey(now)] || initStats()
        },
        thegoobr: {
            daily: stats.thegoobr.daily[getDateKey(now)] || initStats(),
            weekly: stats.thegoobr.weekly[getWeekKey(now)] || initStats(),
            monthly: stats.thegoobr.monthly[getMonthKey(now)] || initStats()
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
                * { box-sizing: border-box; }
                body { font-family: Arial, sans-serif; max-width: 1400px; margin: 0 auto; padding: 20px; background: #1a1a2e; color: #eee; }
                h1 { color: #00ff00; margin-bottom: 10px; }
                .tabs { display: flex; gap: 10px; margin: 20px 0; }
                .tab { background: #16213e; color: #00ff00; border: 2px solid #00ff00; padding: 10px 20px; border-radius: 4px; cursor: pointer; transition: all 0.3s; }
                .tab.active { background: #00ff00; color: #000; }
                .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin: 20px 0; }
                .stat-card { background: #16213e; padding: 20px; border-radius: 8px; border: 2px solid #00ff00; }
                .stat-card h2 { margin-top: 0; color: #00ff00; font-size: 18px; }
                .stat-item { margin: 8px 0; font-size: 14px; }
                .stat-item strong { color: #aaa; }
                .bets { margin-top: 30px; }
                table { width: 100%; border-collapse: collapse; font-size: 13px; }
                th, td { padding: 8px; text-align: left; border-bottom: 1px solid #333; }
                th { background: #16213e; color: #00ff00; position: sticky; top: 0; }
                button { background: #00ff00; color: #000; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; margin: 5px; font-weight: bold; }
                button:hover { background: #00cc00; }
                .positive { color: #00ff00; font-weight: bold; }
                .negative { color: #ff0000; font-weight: bold; }
                .highlight { background: #2d3748; }
                .filter { margin: 10px 0; }
                input { padding: 8px; background: #16213e; color: #eee; border: 1px solid #00ff00; border-radius: 4px; }
                .win { color: #00ff00; }
                .loss { color: #ff0000; }
            </style>
        </head>
        <body>
            <h1>🎲 Shuffle.com Bet Tracker</h1>
            <p style="color: #888;">Live tracking - Auto-refresh every 5s</p>
            
            <div class="tabs">
                <div class="tab active" onclick="switchTab('all')">All Bets</div>
                <div class="tab" onclick="switchTab('thegoobr')">TheGoobr Only</div>
            </div>
            
            <div>
                <button onclick="sendStats('daily')">📅 Send Daily Stats to Discord</button>
                <button onclick="sendStats('weekly')">📊 Send Weekly Stats to Discord</button>
                <button onclick="sendStats('monthly')">📈 Send Monthly Stats to Discord</button>
                <button onclick="loadData()">🔄 Refresh Now</button>
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
                            <th>Bet Amount</th>
                            <th>Multiplier</th>
                            <th>Payout</th>
                            <th>Result</th>
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
                            <div class="stat-item"><strong>Wins/Losses:</strong> <span class="positive">\${statsData.daily.wins}</span> / <span class="negative">\${statsData.daily.losses}</span></div>
                            <div class="stat-item"><strong>Win Rate:</strong> \${statsData.daily.winRate.toFixed(1)}%</div>
                            <div class="stat-item"><strong>Wagered:</strong> $\${statsData.daily.totalWagered.toFixed(2)}</div>
                            <div class="stat-item"><strong>Payout:</strong> $\${statsData.daily.totalPayout.toFixed(2)}</div>
                            <div class="stat-item"><strong>Net Profit:</strong> <span class="\${statsData.daily.totalProfit >= 0 ? 'positive' : 'negative'}">$\${statsData.daily.totalProfit.toFixed(2)}</span></div>
                            <div class="stat-item"><strong>Avg Bet:</strong> $\${statsData.daily.averageBet.toFixed(2)}</div>
                            <div class="stat-item"><strong>Avg Multiplier:</strong> \${statsData.daily.averageMultiplier.toFixed(2)}x</div>
                            <div class="stat-item"><strong>Biggest Win:</strong> <span class="positive">$\${statsData.daily.biggestWin.toFixed(2)}</span></div>
                            <div class="stat-item"><strong>Biggest Loss:</strong> <span class="negative">$\${statsData.daily.biggestLoss.toFixed(2)}</span></div>
                        </div>
                        <div class="stat-card">
                            <h2>📊 Weekly Stats</h2>
                            <div class="stat-item"><strong>Total Bets:</strong> \${statsData.weekly.totalBets}</div>
                            <div class="stat-item"><strong>Wins/Losses:</strong> <span class="positive">\${statsData.weekly.wins}</span> / <span class="negative">\${statsData.weekly.losses}</span></div>
                            <div class="stat-item"><strong>Win Rate:</strong> \${statsData.weekly.winRate.toFixed(1)}%</div>
                            <div class="stat-item"><strong>Wagered:</strong> $\${statsData.weekly.totalWagered.toFixed(2)}</div>
                            <div class="stat-item"><strong>Payout:</strong> $\${statsData.weekly.totalPayout.toFixed(2)}</div>
                            <div class="stat-item"><strong>Net Profit:</strong> <span class="\${statsData.weekly.totalProfit >= 0 ? 'positive' : 'negative'}">$\${statsData.weekly.totalProfit.toFixed(2)}</span></div>
                            <div class="stat-item"><strong>Avg Bet:</strong> $\${statsData.weekly.averageBet.toFixed(2)}</div>
                            <div class="stat-item"><strong>Avg Multiplier:</strong> \${statsData.weekly.averageMultiplier.toFixed(2)}x</div>
                            <div class="stat-item"><strong>Biggest Win:</strong> <span class="positive">$\${statsData.weekly.biggestWin.toFixed(2)}</span></div>
                            <div class="stat-item"><strong>Biggest Loss:</strong> <span class="negative">$\${statsData.weekly.biggestLoss.toFixed(2)}</span></div>
                        </div>
                        <div class="stat-card">
                            <h2>📈 Monthly Stats</h2>
                            <div class="stat-item"><strong>Total Bets:</strong> \${statsData.monthly.totalBets}</div>
                            <div class="stat-item"><strong>Wins/Losses:</strong> <span class="positive">\${statsData.monthly.wins}</span> / <span class="negative">\${statsData.monthly.losses}</span></div>
                            <div class="stat-item"><strong>Win Rate:</strong> \${statsData.monthly.winRate.toFixed(1)}%</div>
                            <div class="stat-item"><strong>Wagered:</strong> $\${statsData.monthly.totalWagered.toFixed(2)}</div>
                            <div class="stat-item"><strong>Payout:</strong> $\${statsData.monthly.totalPayout.toFixed(2)}</div>
                            <div class="stat-item"><strong>Net Profit:</strong> <span class="\${statsData.monthly.totalProfit >= 0 ? 'positive' : 'negative'}">$\${statsData.monthly.totalProfit.toFixed(2)}</span></div>
                            <div class="stat-item"><strong>Avg Bet:</strong> $\${statsData.monthly.averageBet.toFixed(2)}</div>
                            <div class="stat-item"><strong>Avg Multiplier:</strong> \${statsData.monthly.averageMultiplier.toFixed(2)}x</div>
                            <div class="stat-item"><strong>Biggest Win:</strong> <span class="positive">$\${statsData.monthly.biggestWin.toFixed(2)}</span></div>
                            <div class="stat-item"><strong>Biggest Loss:</strong> <span class="negative">$\${statsData.monthly.biggestLoss.toFixed(2)}</span></div>
                        </div>
                    \`;
                    
                    document.getElementById('stats').innerHTML = statsHtml;
                }
                
                async function loadBets() {
                    const url = currentTab === 'thegoobr' ? '/api/bets?username=TheGoobr&limit=150' : '/api/bets?limit=150';
                    const res = await fetch(url);
                    allBets = await res.json();
                    displayBets(allBets);
                }
                
                function displayBets(betsToShow) {
                    document.getElementById('betCount').textContent = betsToShow.length;
                    
                    const rows = betsToShow.map(bet => \`
                        <tr class="\${bet.username === 'TheGoobr' ? 'highlight' : ''}">
                            <td>\${new Date(bet.timestamp).toLocaleTimeString()}</td>
                            <td><strong>\${bet.username}</strong></td>
                            <td>\${bet.game}</td>
                            <td>\${bet.betAmountText || bet.amount || 'N/A'}</td>
                            <td>\${bet.multiplierText || bet.multiplier || 'N/A'}</td>
                            <td class="\${bet.isWin ? 'win' : 'loss'}">\${bet.payoutText || bet.profit || 'N/A'}</td>
                            <td>\${bet.isWin ? '✅ WIN' : '❌ LOSS'}</td>
                        </tr>
                    \`).join('');
                    
                    document.getElementById('betsBody').innerHTML = rows || '<tr><td colspan="7">No bets yet</td></tr>';
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
                setInterval(loadData, 5000);
            </script>
        </body>
        </html>
    `);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`🎲 Tracking ALL bets, Discord notifications for: ${TARGET_USERNAME}`);
    console.log(`📨 Discord webhook: ${DISCORD_WEBHOOK_URL ? 'Configured' : 'Not configured'}`);
});
