const puppeteer = require('puppeteer');
const axios = require('axios');

const SHUFFLE_URL = 'https://shuffle.com';
const SCAN_INTERVAL = 2000; // Scan every 2 seconds to process 50-row chunks efficiently

let browser = null;
let page = null;
let isRunning = false;
let processedBets = new Set();

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

function createStableBetId(username, amount, game, multiplier, payout) {
    // Create a stable ID based on bet data, not scrape time
    // This prevents duplicates when same bet appears in multiple scrapes
    return `${username}_${amount}_${game}_${multiplier}_${payout}`;
}

async function scrapeBets(onBetFound) {
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
            return;
        }

        const rows = await betTable.$$('tr');
        
        if (rows.length === 0) {
            return;
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
                const betId = createStableBetId(username, betAmount, game, multiplier, payout);

                if (!processedBets.has(betId)) {
                    processedBets.add(betId);

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
                    
                    // Log all bets including Hidden (all Hidden users tracked as single person)
                    console.log(`✅ ${username} | ${game} | ${betAmountText} ${currency} ($${betAmountUSD.toFixed(2)}) | ${multiplierText} | Payout: ${payoutText} ${payoutCurrency} ($${payoutUSD.toFixed(2)})`);
                    
                    if (onBetFound) {
                        onBetFound(betData);
                    }

                    if (processedBets.size > 5000) {
                        const toDelete = Array.from(processedBets).slice(0, 2000);
                        toDelete.forEach(id => processedBets.delete(id));
                    }
                }
            } catch (err) {
                console.error('Error parsing bet row:', err.message);
            }
        }
    } catch (error) {
        console.error('Error scraping bets:', error.message);
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

        browser = await puppeteer.launch({
            headless: true,
            executablePath: '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-software-rasterizer',
                '--disable-extensions'
            ]
        });

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
        
        // Click on High Rollers tab
        console.log('🎰 Clicking High Rollers tab...');
        try {
            const highRollerClicked = await page.evaluate(() => {
                const highRollerButton = document.querySelector('button[data-testid="high-roller-bets"]') ||
                                        document.querySelector('button#high-roller-bets') ||
                                        document.querySelector('button.TabView_tab__yrvwe');
                if (highRollerButton) {
                    highRollerButton.click();
                    return true;
                }
                return false;
            });
            
            if (highRollerClicked) {
                console.log('✅ High Rollers tab clicked');
                await new Promise(resolve => setTimeout(resolve, 1500));
            } else {
                console.log('⚠️ High Rollers tab not found');
            }
        } catch (err) {
            console.log('⚠️ Error clicking High Rollers tab:', err.message);
        }
        
        console.log('✅ Connected to shuffle.com');
        console.log('👀 Monitoring High Roller bets...');

        setInterval(async () => {
            await scrapeBets(onBetFound);
        }, SCAN_INTERVAL);

    } catch (error) {
        console.error('❌ Scraper error:', error.message);
        isRunning = false;
        if (browser) await browser.close();
    }
}

async function stopScraper() {
    isRunning = false;
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
    getCryptoPrices
};
