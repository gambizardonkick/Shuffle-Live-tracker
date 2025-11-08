const puppeteer = require('puppeteer');
const axios = require('axios');

const SHUFFLE_URL = 'https://shuffle.com';
const SCAN_INTERVAL = 2000;

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

function createStableBetId(username, amount, game, multiplier, timestamp) {
    return `${username}_${amount}_${game}_${multiplier}_${Math.floor(timestamp / 5000)}`;
}

async function scrapeBets(onBetFound) {
    try {
        let tableBody = await page.$('tbody[data-testid="table-body"]');
        
        if (!tableBody) {
            tableBody = await page.$('tbody');
        }
        
        if (!tableBody) {
            console.log('⚠️ No table body found');
            return;
        }

        let rows = await tableBody.$$('tr[aria-label="View detail"]');
        
        if (rows.length === 0) {
            rows = await tableBody.$$('tr');
            if (rows.length > 0) {
                console.log(`📊 Found ${rows.length} rows (without aria-label)`);
            } else {
                console.log('⚠️ No rows found in table');
                return;
            }
        } else {
            console.log(`📊 Found ${rows.length} rows with aria-label`);
        }

        for (const row of rows) {
            try {
                const cells = await row.$$('td');
                if (cells.length < 5) {
                    console.log(`⚠️ Row has only ${cells.length} cells, skipping`);
                    continue;
                }
                
                console.log(`📝 Processing row with ${cells.length} cells`);

                const userCell = cells[0];
                const gameCell = cells[1];
                const amountCell = cells[2];
                const multiplierCell = cells[3];
                const payoutCell = cells[4];

                let username = 'Unknown';
                const anonymousDiv = await userCell.$('.AnonymousUser_root__4chUx');
                if (anonymousDiv) {
                    const textSpan = await anonymousDiv.$('.AnonymousUser_text__0E_PM');
                    if (textSpan) {
                        username = await textSpan.evaluate(el => el.textContent.trim());
                    } else {
                        username = 'Hidden';
                    }
                } else {
                    const userLink = await userCell.$('a[href*="/user/"]');
                    if (userLink) {
                        username = await userLink.evaluate(el => el.textContent.trim() || el.getAttribute('href').replace('/user/', ''));
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

                const amountSpan = await amountCell.$('.FiatWithTooltip_evenlySpacedNumber__wQSLB, .fiat-with-tool-tip-text');
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

                const payoutSpan = await payoutCell.$('.FiatWithTooltip_evenlySpacedNumber__wQSLB, .fiat-with-tool-tip-text');
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
                const betId = createStableBetId(username, betAmount, game, multiplier, timestamp);

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
        await page.goto(SHUFFLE_URL, { waitUntil: 'networkidle0', timeout: 90000 });
        
        console.log('⏳ Waiting for page to fully load...');
        await new Promise(resolve => setTimeout(resolve, 8000));
        
        console.log('📜 Scrolling down progressively...');
        for (let i = 0; i < 5; i++) {
            await page.evaluate((i) => {
                window.scrollTo(0, (document.body.scrollHeight / 5) * (i + 1));
            }, i);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.log('⏬ Final scroll to bottom...');
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });
        
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        console.log('🔍 Looking for bet table...');
        const tableExists = await page.$('tbody[data-testid="table-body"]');
        
        if (!tableExists) {
            console.log('⚠️ Table not found, trying alternative selectors...');
            const altTable = await page.$('tbody');
            if (altTable) {
                console.log('✅ Found alternative table element');
            } else {
                throw new Error('No bet table found on page');
            }
        } else {
            console.log('✅ Found bet table!');
        }
        
        console.log('✅ Connected to shuffle.com');
        console.log('👀 Monitoring bets...');

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
