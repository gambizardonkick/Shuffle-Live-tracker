const puppeteer = require('puppeteer');
const axios = require('axios');

const SHUFFLE_URL = 'https://shuffle.com';

let browser = null;
let page = null;
let isRunning = false;
let processedBets = new Set(); // Track by actual API bet ID

const cryptoPrices = {
    BTC: 0, ETH: 0, USDT: 1, USDC: 1, LTC: 0, BCH: 0,
    DOGE: 0, XRP: 0, BNB: 0, SOL: 0, ADA: 0, TRX: 0
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

function convertToUSD(amount, currency) {
    const price = cryptoPrices[currency] || 1;
    return amount * price;
}

function parseNumericValue(text) {
    if (!text) return 0;
    const cleaned = String(text).replace(/[\$,\s]/g, '').replace(/[^0-9.\-]/g, '');
    const value = parseFloat(cleaned);
    return isNaN(value) ? 0 : value;
}

function parseBetFromAPI(apiData) {
    try {
        // Parse shuffle.com GraphQL response format
        // Exact field names from GetLatestBets query:
        // id, username, vipLevel, currency, amount, payout, multiplier, gameName, gameCategory, gameSlug
        
        const username = apiData.username || 'Unknown';
        const game = apiData.gameName || apiData.gameSlug || 'Unknown';
        
        // Currency is uppercase (BTC, ETH, USDT, etc.)
        const currency = (apiData.currency || 'USDT').toUpperCase();
        
        // Bet amount
        const betAmount = parseNumericValue(apiData.amount || 0);
        const betAmountText = betAmount.toFixed(8).replace(/\.?0+$/, ''); // Remove trailing zeros
        const betAmountUSD = convertToUSD(betAmount, currency);
        
        // Multiplier
        const multiplier = parseNumericValue(apiData.multiplier || 0);
        const multiplierText = multiplier > 0 ? `${multiplier.toFixed(2)}x` : '0.00x';
        
        // Payout
        const payout = parseNumericValue(apiData.payout || 0);
        const payoutText = payout.toFixed(8).replace(/\.?0+$/, ''); // Remove trailing zeros
        const payoutUSD = convertToUSD(payout, currency);
        
        // Win/Loss determination
        const isWin = payout > betAmount;
        
        // Use API's unique bet ID
        const betId = apiData.id || `${username}_${betAmount}_${game}_${Date.now()}`;
        
        return {
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
            timestamp: Date.now(),
            url: SHUFFLE_URL
        };
    } catch (error) {
        console.error('Error parsing bet from API:', error.message);
        return null;
    }
}

async function startScraper(onBetFound) {
    if (isRunning) {
        console.log('Scraper already running');
        return;
    }

    isRunning = true;
    console.log('🚀 Starting Shuffle.com network scraper...');

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
                '--disable-gpu'
            ]
        });

        page = await browser.newPage();
        
        // Enable request interception
        await page.setRequestInterception(true);
        
        // Log all requests to find the bet API endpoint
        page.on('request', request => {
            const url = request.url();
            // Let all requests through
            request.continue();
        });

        // Intercept GraphQL responses to capture bet data
        page.on('response', async response => {
            const url = response.url();
            
            // Target shuffle.com's GraphQL endpoint specifically
            if (url.includes('/main-api/graphql/api/graphql')) {
                try {
                    const contentType = response.headers()['content-type'] || '';
                    
                    // Only process JSON responses
                    if (contentType.includes('application/json')) {
                        const data = await response.json();
                        
                        // GraphQL response structure: {data: {latestBets: [...]}}
                        let betsArray = [];
                        
                        if (data && data.data && data.data.latestBets && Array.isArray(data.data.latestBets)) {
                            betsArray = data.data.latestBets;
                            console.log(`🎯 Intercepted ${betsArray.length} bets from GraphQL API`);
                        }
                        
                        // Process each bet
                        for (const betData of betsArray) {
                            const bet = parseBetFromAPI(betData);
                            
                            if (bet && !processedBets.has(bet.betId)) {
                                processedBets.add(bet.betId);
                                
                                console.log(`✅ ${bet.username} | ${bet.game} | ${bet.betAmountText} ${bet.currency} ($${bet.betAmountUSD.toFixed(2)}) | ${bet.multiplierText} | Payout: $${bet.payoutUSD.toFixed(2)}`);
                                
                                if (onBetFound) {
                                    onBetFound(bet);
                                }
                                
                                // Cleanup old bet IDs
                                if (processedBets.size > 10000) {
                                    const toDelete = Array.from(processedBets).slice(0, 5000);
                                    toDelete.forEach(id => processedBets.delete(id));
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error parsing GraphQL response:', error.message);
                }
            }
        });
        
        console.log('📡 Navigating to shuffle.com...');
        await page.goto(SHUFFLE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Wait for page to load
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Scroll to bottom to load the Live Bets section
        await page.evaluate(() => {
            const mainContent = document.querySelector('#pageContent') || 
                               document.querySelector('.CasinoLayout_mainContent__fyA1x') ||
                               document.querySelector('[class*="CasinoLayout_mainContent"]') ||
                               document.querySelector('main');
            
            if (mainContent) {
                mainContent.scrollTop = mainContent.scrollHeight;
            } else {
                window.scrollTo(0, document.body.scrollHeight);
            }
        });
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log('✅ Connected - intercepting network traffic for bet data');
        console.log('🎯 Monitoring API responses for live bets...');
        console.log('🔄 Triggering bet data refresh every 5 seconds...');
        
        // Actively trigger bet updates by clicking refresh or scrolling
        // This forces shuffle.com to call the GraphQL endpoint
        setInterval(async () => {
            try {
                // Method 1: Try to click a refresh button if it exists
                const refreshed = await page.evaluate(() => {
                    // Look for refresh/reload buttons
                    const refreshBtn = document.querySelector('[aria-label*="refresh" i], [aria-label*="reload" i], button[class*="refresh" i]');
                    if (refreshBtn) {
                        refreshBtn.click();
                        return true;
                    }
                    return false;
                });
                
                if (!refreshed) {
                    // Method 2: Scroll to trigger React component re-render
                    await page.evaluate(() => {
                        const mainContent = document.querySelector('#pageContent') || 
                                           document.querySelector('.CasinoLayout_mainContent__fyA1x') ||
                                           document.querySelector('[class*="CasinoLayout_mainContent"]') ||
                                           document.querySelector('main');
                        
                        if (mainContent) {
                            // Scroll slightly to trigger refresh
                            const currentScroll = mainContent.scrollTop;
                            mainContent.scrollTop = currentScroll + 10;
                            setTimeout(() => {
                                mainContent.scrollTop = currentScroll;
                            }, 100);
                        }
                    });
                }
            } catch (err) {
                // Ignore interaction errors
            }
        }, 5000); // Refresh every 5 seconds

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
