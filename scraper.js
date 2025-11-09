const puppeteer = require('puppeteer');
const axios = require('axios');

const SHUFFLE_URL = 'https://shuffle.com';
const REPORT_INTERVAL = 3000; // Report batches every 3 seconds

let browser = null;
let page = null;
let isRunning = false;
let processedBets = new Set();
let betQueue = []; // Queue for real-time captured bets

const cryptoPrices = {
    BTC: 0,
    ETH: 0,
    USDT: 1,
    USDC: 1,
    LTC: 0,
    BCH: 0,
    DOGE: 0,
    XRP: 0,
    BNB: 0,
    SOL: 0,
    ADA: 0,
    TRX: 0
};

async function fetchCryptoPrices() {
    try {
        const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
            params: {
                ids: 'bitcoin,ethereum,tether,usd-coin,litecoin,bitcoin-cash,dogecoin,ripple,binancecoin,solana,cardano,tron',
                vs_currencies: 'usd'
            }
        });
        
        cryptoPrices.BTC = response.data.bitcoin?.usd || 0;
        cryptoPrices.ETH = response.data.ethereum?.usd || 0;
        cryptoPrices.USDT = 1;
        cryptoPrices.USDC = 1;
        cryptoPrices.LTC = response.data.litecoin?.usd || 0;
        cryptoPrices.BCH = response.data['bitcoin-cash']?.usd || 0;
        cryptoPrices.DOGE = response.data.dogecoin?.usd || 0;
        cryptoPrices.XRP = response.data.ripple?.usd || 0;
        cryptoPrices.BNB = response.data.binancecoin?.usd || 0;
        cryptoPrices.SOL = response.data.solana?.usd || 0;
        cryptoPrices.ADA = response.data.cardano?.usd || 0;
        cryptoPrices.TRX = response.data.tron?.usd || 0;
        
        console.log('✅ Crypto prices updated');
    } catch (error) {
        console.error('❌ Error fetching crypto prices:', error.message);
    }
}

function parseCurrency(imgSrc) {
    if (!imgSrc) return 'USDT';
    
    const currencyMap = {
        'btc': 'BTC',
        'eth': 'ETH',
        'usdt': 'USDT',
        'usdc': 'USDC',
        'ltc': 'LTC',
        'bch': 'BCH',
        'doge': 'DOGE',
        'xrp': 'XRP',
        'bnb': 'BNB',
        'sol': 'SOL',
        'ada': 'ADA',
        'trx': 'TRX'
    };
    
    for (const [key, value] of Object.entries(currencyMap)) {
        if (imgSrc.toLowerCase().includes(key)) {
            return value;
        }
    }
    
    return 'USDT';
}

function parseNumericValue(text) {
    if (!text) return 0;
    const cleaned = text.replace(/[\$,\s]/g, '').replace(/[^0-9.\-]/g, '');
    const value = parseFloat(cleaned);
    return isNaN(value) ? 0 : value;
}

function convertToUSD(amount, currency) {
    const price = cryptoPrices[currency] || 1;
    return amount * price;
}

function createStableBetId(username, amount, game, multiplier, payout, timestamp) {
    // Create a unique ID including timestamp to allow multiple identical bets
    return `${username}_${amount}_${game}_${multiplier}_${payout}_${timestamp}`;
}

async function scrapeBets() {
    const currentBets = [];
    
    try {
        // Find all tables and get the one with 5+ columns
        const allTables = await page.$$('table');
        
        let betTable = null;
        for (const table of allTables) {
            const tbody = await table.$('tbody');
            if (tbody) {
                const rows = await tbody.$$('tr');
                if (rows.length > 0) {
                    const cells = await rows[0].$$('td');
                    if (cells.length >= 5) {
                        betTable = tbody;
                        break;
                    }
                }
            }
        }
        
        if (!betTable) {
            return currentBets;
        }

        const rows = await betTable.$$('tr');
        
        if (rows.length === 0) {
            return currentBets;
        }
        
        for (const row of rows) {
            try {
                const cells = await row.$$('td');
                if (cells.length < 5) {
                    continue;
                }

                const userCell = cells[0];
                const gameCell = cells[1];
                const amountCell = cells[2];
                const multiplierCell = cells[3];
                const payoutCell = cells[4];

                let username = 'Unknown';
                const anonymousDiv = await userCell.$('.AnonymousUser_root__4chUx');
                if (anonymousDiv) {
                    username = 'Hidden';
                } else {
                    const userButton = await userCell.$('button');
                    if (userButton) {
                        username = await userButton.evaluate(el => {
                            // Remove VIP badge if present
                            const clone = el.cloneNode(true);
                            const badge = clone.querySelector('.VipBadge_root__ozOvC');
                            if (badge) badge.remove();
                            return clone.textContent.trim();
                        });
                    }
                }

                const gameTitle = await gameCell.$('.GameTitle_root__R4XRF');
                let game = 'Unknown';
                if (gameTitle) {
                    game = await gameTitle.evaluate(el => el.textContent.trim());
                }

                const currencyImg = await amountCell.$('.CryptoIcon_image__1494s');
                let currency = 'USDT';
                if (currencyImg) {
                    const imgSrc = await currencyImg.evaluate(el => el.getAttribute('src'));
                    currency = parseCurrency(imgSrc);
                }

                const amountSpan = await amountCell.$('.FormattedAmount_evenlySpacedNumber__hmNwm');
                let betAmountText = '';
                let betAmount = 0;
                if (amountSpan) {
                    betAmountText = await amountSpan.evaluate(el => el.textContent.trim());
                    betAmount = parseNumericValue(betAmountText);
                }

                const multiplierSpan = await multiplierCell.$('.MultiplierCell_root__Wd4zc span[style*="color"]');
                let multiplierText = '';
                let multiplier = 0;
                if (multiplierSpan) {
                    multiplierText = await multiplierSpan.evaluate(el => el.textContent.trim());
                    multiplier = parseNumericValue(multiplierText);
                }

                const payoutCurrencyImg = await payoutCell.$('.CryptoIcon_image__1494s');
                let payoutCurrency = currency;
                if (payoutCurrencyImg) {
                    const imgSrc = await payoutCurrencyImg.evaluate(el => el.getAttribute('src'));
                    payoutCurrency = parseCurrency(imgSrc);
                }

                const payoutSpan = await payoutCell.$('.FormattedAmount_evenlySpacedNumber__hmNwm');
                let payoutText = '';
                let payout = 0;
                if (payoutSpan) {
                    payoutText = await payoutSpan.evaluate(el => el.textContent.trim());
                    payout = parseNumericValue(payoutText);
                }

                const betAmountUSD = convertToUSD(betAmount, currency);
                const payoutUSD = convertToUSD(payout, payoutCurrency);
                const isWin = payout > 0;

                const timestamp = Date.now();
                const betId = createStableBetId(username, betAmount, game, multiplier, payout, timestamp);

                const betData = {
                    betId,
                    username,
                    game,
                    currency,
                    betAmount,
                    betAmountText,
                    betAmountUSD,
                    multiplier,
                    multiplierText,
                    payout,
                    payoutText,
                    payoutUSD,
                    isWin,
                    timestamp,
                    url: SHUFFLE_URL
                };
                
                currentBets.push(betData);
                
            } catch (err) {
                console.error('Error parsing bet row:', err.message);
            }
        }
    } catch (error) {
        console.error('Error scraping bets:', error.message);
    }
    
    return currentBets;
}

async function setupRealtimeCapture() {
    try {
        // Inject MutationObserver to watch for new table rows in real-time
        await page.exposeFunction('onBetDetected', (betRawData) => {
            betQueue.push(betRawData);
        });
        
        await page.evaluate(() => {
            // Find the bet table
            const findBetTable = () => {
                const allTables = document.querySelectorAll('table');
                for (const table of allTables) {
                    const tbody = table.querySelector('tbody');
                    if (tbody) {
                        const rows = tbody.querySelectorAll('tr');
                        if (rows.length > 0) {
                            const cells = rows[0].querySelectorAll('td');
                            if (cells.length >= 5) {
                                return tbody;
                            }
                        }
                    }
                }
                return null;
            };
            
            const parseBetRow = (row) => {
                try {
                    const cells = row.querySelectorAll('td');
                    if (cells.length < 5) return null;
                    
                    const userCell = cells[0];
                    const gameCell = cells[1];
                    const amountCell = cells[2];
                    const multiplierCell = cells[3];
                    const payoutCell = cells[4];
                    
                    // Parse username
                    let username = 'Unknown';
                    const anonymousDiv = userCell.querySelector('.AnonymousUser_root__4chUx');
                    if (anonymousDiv) {
                        username = 'Hidden';
                    } else {
                        const userButton = userCell.querySelector('button');
                        if (userButton) {
                            const clone = userButton.cloneNode(true);
                            const badge = clone.querySelector('.VipBadge_root__ozOvC');
                            if (badge) badge.remove();
                            username = clone.textContent.trim();
                        }
                    }
                    
                    // Parse game
                    const gameTitle = gameCell.querySelector('.GameTitle_root__R4XRF');
                    const game = gameTitle ? gameTitle.textContent.trim() : 'Unknown';
                    
                    // Parse currency
                    const currencyImg = amountCell.querySelector('.CryptoIcon_image__1494s');
                    let currency = 'USDT';
                    if (currencyImg) {
                        const imgSrc = currencyImg.getAttribute('src') || '';
                        if (imgSrc.includes('btc')) currency = 'BTC';
                        else if (imgSrc.includes('eth')) currency = 'ETH';
                        else if (imgSrc.includes('usdc')) currency = 'USDC';
                        else if (imgSrc.includes('sol')) currency = 'SOL';
                        // Add more as needed
                    }
                    
                    // Parse bet amount
                    const amountSpan = amountCell.querySelector('.FormattedAmount_evenlySpacedNumber__hmNwm');
                    const betAmountText = amountSpan ? amountSpan.textContent.trim() : '0';
                    
                    // Parse multiplier
                    const multiplierSpan = multiplierCell.querySelector('.MultiplierCell_root__Wd4zc span[style*="color"]');
                    const multiplierText = multiplierSpan ? multiplierSpan.textContent.trim() : '0';
                    
                    // Parse payout
                    const payoutSpan = payoutCell.querySelector('.FormattedAmount_evenlySpacedNumber__hmNwm');
                    const payoutText = payoutSpan ? payoutSpan.textContent.trim() : '0';
                    
                    return {
                        username,
                        game,
                        currency,
                        betAmountText,
                        multiplierText,
                        payoutText,
                        timestamp: Date.now()
                    };
                } catch (err) {
                    return null;
                }
            };
            
            const betTable = findBetTable();
            if (!betTable) {
                console.log('⚠️ Could not find bet table for MutationObserver');
                return;
            }
            
            // Set up MutationObserver to watch for new rows
            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    for (const node of mutation.addedNodes) {
                        if (node.tagName === 'TR') {
                            const betData = parseBetRow(node);
                            if (betData && window.onBetDetected) {
                                window.onBetDetected(betData);
                            }
                        }
                    }
                }
            });
            
            observer.observe(betTable, {
                childList: true,
                subtree: false
            });
            
            console.log('✅ MutationObserver active - capturing bets in real-time');
        });
        
        console.log('✅ Real-time bet capture initialized');
    } catch (error) {
        console.error('Error setting up real-time capture:', error.message);
    }
}

async function processQueuedBets(onBetFound) {
    if (betQueue.length === 0) return;
    
    const betsToProcess = [...betQueue];
    betQueue = [];
    
    let processedCount = 0;
    
    for (const rawBet of betsToProcess) {
        try {
            const betAmount = parseNumericValue(rawBet.betAmountText);
            const multiplier = parseNumericValue(rawBet.multiplierText);
            const payout = parseNumericValue(rawBet.payoutText);
            
            const betAmountUSD = convertToUSD(betAmount, rawBet.currency);
            const payoutUSD = convertToUSD(payout, rawBet.currency);
            const isWin = payout > 0;
            
            const betId = createStableBetId(rawBet.username, betAmount, rawBet.game, multiplier, payout, rawBet.timestamp);
            
            if (!processedBets.has(betId)) {
                processedBets.add(betId);
                
                const betData = {
                    betId,
                    username: rawBet.username,
                    game: rawBet.game,
                    currency: rawBet.currency,
                    betAmount,
                    betAmountText: rawBet.betAmountText,
                    betAmountUSD,
                    multiplier,
                    multiplierText: rawBet.multiplierText,
                    payout,
                    payoutText: rawBet.payoutText,
                    payoutUSD,
                    isWin,
                    timestamp: rawBet.timestamp,
                    url: SHUFFLE_URL
                };
                
                console.log(`✅ ${betData.username} | ${betData.game} | ${betData.betAmountText} ${betData.currency} ($${betData.betAmountUSD.toFixed(2)}) | ${betData.multiplierText} | Payout: ${betData.payoutText} ($${betData.payoutUSD.toFixed(2)})`);
                
                if (onBetFound) {
                    onBetFound(betData);
                }
                
                processedCount++;
                
                if (processedBets.size > 5000) {
                    const toDelete = Array.from(processedBets).slice(0, 2000);
                    toDelete.forEach(id => processedBets.delete(id));
                }
            }
        } catch (err) {
            console.error('Error processing queued bet:', err.message);
        }
    }
    
    if (processedCount > 0) {
        console.log(`📊 Processed ${processedCount} bets from real-time queue`);
    }
}

async function startScraper(onBetFound) {
    if (isRunning) {
        console.log('Scraper already running');
        return;
    }

    isRunning = true;
    console.log('🚀 Starting Shuffle.com scraper...');

    try {
        await fetchCryptoPrices();
        setInterval(fetchCryptoPrices, 60000);

        const launchOptions = {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-software-rasterizer',
                '--disable-extensions'
            ]
        };
        
        // Use Replit's Chromium if running on Replit
        if (process.env.REPL_ID) {
            launchOptions.executablePath = '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';
        }
        // On Render/production, Puppeteer will auto-find downloaded Chrome
        
        browser = await puppeteer.launch(launchOptions);

        page = await browser.newPage();
        
        await page.setViewport({ width: 1920, height: 1080 });
        
        console.log('📡 Navigating to shuffle.com...');
        await page.goto(SHUFFLE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Scroll directly to bottom to load Live Bets table
        await page.evaluate(() => {
            const mainContent = document.querySelector('#pageContent') || 
                               document.querySelector('.CasinoLayout_mainContent__fyA1x') ||
                               document.querySelector('[class*="CasinoLayout_mainContent"]');
            
            if (mainContent) {
                mainContent.scrollTop = mainContent.scrollHeight;
            }
        });
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.log('🔍 Looking for Live Bets section...');
        
        // Debug: Check all tables on page
        const tableInfo = await page.evaluate(() => {
            const allTables = document.querySelectorAll('table');
            const info = [];
            allTables.forEach((table, idx) => {
                const rows = table.querySelectorAll('tbody tr');
                if (rows.length > 0) {
                    const firstRow = rows[0];
                    const cells = firstRow.querySelectorAll('td');
                    info.push({
                        index: idx,
                        rowCount: rows.length,
                        columnCount: cells.length
                    });
                }
            });
            return info;
        });
        
        console.log('📋 Tables found on page:', JSON.stringify(tableInfo, null, 2));
        
        // Wait for and find the live bets table
        const liveBetsFound = tableInfo.some(t => t.columnCount >= 5);
        
        if (!liveBetsFound) {
            console.log('⚠️ Live bets table not found - waiting...');
            await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
            console.log('✅ Found Live Bets table!');
        }
        
        // Change table row limit from 10 to 50
        console.log('🔧 Changing to 50 rows...');
        try {
            const dropdownClicked = await page.evaluate(() => {
                const button = document.querySelector('.ActivityBoard_select__9i4OK') || 
                              document.querySelector('button[aria-label*="activity query limit"]');
                if (button) {
                    button.click();
                    return true;
                }
                return false;
            });
            
            if (dropdownClicked) {
                await new Promise(resolve => setTimeout(resolve, 300));
                
                const option50Clicked = await page.evaluate(() => {
                    const options = Array.from(document.querySelectorAll('[role="option"]'));
                    const option50 = options.find(opt => opt.textContent.trim() === '50');
                    if (option50) {
                        option50.click();
                        return true;
                    }
                    return false;
                });
                
                if (option50Clicked) {
                    console.log('✅ Set to 50 rows');
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } else {
                    console.log('⚠️ 50 option not found');
                }
            } else {
                console.log('⚠️ Dropdown not found');
            }
        } catch (err) {
            console.log('⚠️ Error changing row limit:', err.message);
        }
        
        console.log('✅ Connected to shuffle.com');
        console.log('👀 Monitoring all bets...');
        console.log(`🔴 REAL-TIME CAPTURE MODE - MutationObserver watching table`);
        console.log(`📊 Batched reporting every ${REPORT_INTERVAL/1000}s`);
        
        // Set up MutationObserver for real-time bet capture
        await setupRealtimeCapture();
        
        // Process queued bets every 3 seconds
        setInterval(async () => {
            if (!isRunning) return;
            await processQueuedBets(onBetFound);
        }, REPORT_INTERVAL);

    } catch (error) {
        console.error('❌ Scraper error:', error.message);
        isRunning = false;
        if (browser) await browser.close();
    }
}

async function stopScraper() {
    isRunning = false;
    betQueue = [];
    if (browser) {
        await browser.close();
        browser = null;
        page = null;
    }
    console.log('🛑 Scraper stopped');
}

function getCryptoPrices() {
    return cryptoPrices;
}

module.exports = {
    startScraper,
    stopScraper,
    getCryptoPrices,
    createStableBetId
};
