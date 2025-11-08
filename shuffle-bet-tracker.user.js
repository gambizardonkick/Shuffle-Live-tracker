// ==UserScript==
// @name         Shuffle.com Bet Tracker for TheGoobr
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Track bets from TheGoobr on shuffle.com and send to Discord
// @author       You
// @match        https://shuffle.com/*
// @match        https://*.shuffle.com/*
// @grant        GM_xmlhttpRequest
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // Configuration
    const TARGET_USERNAME = 'TheGoobr';
    const BACKEND_URL = 'https://bd156f34-9fce-49b2-90d2-a044ad76fe9c-00-zuut6ynnxfx.sisko.replit.dev';
    const CHECK_INTERVAL = 2000; // Check every 2 seconds
    
    let processedBets = new Set();
    let isMonitoring = false;

    console.log('[Shuffle Tracker] Script loaded, monitoring for', TARGET_USERNAME);

    // Function to send bet data to backend
    function sendBetToBackend(betData) {
        GM_xmlhttpRequest({
            method: 'POST',
            url: `${BACKEND_URL}/api/bet`,
            headers: {
                'Content-Type': 'application/json'
            },
            data: JSON.stringify(betData),
            onload: function(response) {
                console.log('[Shuffle Tracker] Bet sent to backend:', response.status);
            },
            onerror: function(error) {
                console.error('[Shuffle Tracker] Error sending bet:', error);
            }
        });
    }

    // Function to parse bet information from DOM
    function parseBetElement(betElement) {
        try {
            // Find username
            const usernameEl = betElement.querySelector('[data-testid*="username"], .username, a[href*="/user/"]');
            if (!usernameEl) return null;
            
            const username = usernameEl.textContent.trim();
            
            // Find bet amount
            const amountEl = betElement.querySelector('[data-testid*="amount"], .amount, [class*="amount"]');
            const amount = amountEl ? amountEl.textContent.trim() : 'Unknown';
            
            // Find game type
            const gameEl = betElement.querySelector('[data-testid*="game"], .game, [class*="game"]');
            const game = gameEl ? gameEl.textContent.trim() : 'Unknown';
            
            // Find multiplier/result
            const multiplierEl = betElement.querySelector('[data-testid*="multiplier"], [class*="multiplier"], [class*="payout"]');
            const multiplier = multiplierEl ? multiplierEl.textContent.trim() : 'Unknown';
            
            // Find profit
            const profitEl = betElement.querySelector('[data-testid*="profit"], [class*="profit"], [class*="win"]');
            const profit = profitEl ? profitEl.textContent.trim() : 'Unknown';
            
            // Create unique bet ID
            const timestamp = Date.now();
            const betId = `${username}_${timestamp}_${amount}_${game}`;
            
            return {
                betId,
                username,
                amount,
                game,
                multiplier,
                profit,
                timestamp,
                url: window.location.href
            };
        } catch (error) {
            console.error('[Shuffle Tracker] Error parsing bet:', error);
            return null;
        }
    }

    // Function to scan for bets
    function scanForBets() {
        try {
            // Look for bet containers - adjust selectors based on actual DOM structure
            const betContainers = document.querySelectorAll('[class*="ActivityBoard"], [class*="bet-item"], [class*="BetItem"], [data-testid*="bet"]');
            
            if (betContainers.length === 0) {
                // Try alternative selectors
                const allBets = document.querySelectorAll('div[class*="bet"], div[class*="Bet"], li[class*="activity"]');
                if (allBets.length > 0) {
                    processBetElements(allBets);
                }
            } else {
                processBetElements(betContainers);
            }
        } catch (error) {
            console.error('[Shuffle Tracker] Error scanning for bets:', error);
        }
    }

    // Process bet elements
    function processBetElements(elements) {
        elements.forEach(element => {
            const betData = parseBetElement(element);
            
            if (betData && betData.username === TARGET_USERNAME) {
                // Check if we've already processed this bet
                if (!processedBets.has(betData.betId)) {
                    console.log('[Shuffle Tracker] New bet found for', TARGET_USERNAME, betData);
                    processedBets.add(betData.betId);
                    sendBetToBackend(betData);
                    
                    // Clean up old bet IDs (keep last 1000)
                    if (processedBets.size > 1000) {
                        const toDelete = Array.from(processedBets).slice(0, 100);
                        toDelete.forEach(id => processedBets.delete(id));
                    }
                }
            }
        });
    }

    // Start monitoring
    function startMonitoring() {
        if (isMonitoring) return;
        isMonitoring = true;
        
        console.log('[Shuffle Tracker] Starting monitoring...');
        
        // Initial scan
        scanForBets();
        
        // Set up interval for continuous monitoring
        setInterval(scanForBets, CHECK_INTERVAL);
        
        // Set up MutationObserver to catch new bets immediately
        const observer = new MutationObserver((mutations) => {
            scanForBets();
        });
        
        // Observe the main content area for changes
        const targetNode = document.body;
        observer.observe(targetNode, {
            childList: true,
            subtree: true
        });
    }

    // Wait for page to fully load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(startMonitoring, 3000);
        });
    } else {
        setTimeout(startMonitoring, 3000);
    }

    // Add visual indicator
    const indicator = document.createElement('div');
    indicator.style.cssText = 'position:fixed;top:10px;right:10px;background:#00ff00;color:#000;padding:8px 12px;border-radius:4px;z-index:999999;font-family:monospace;font-size:12px;';
    indicator.textContent = `Tracking ${TARGET_USERNAME}`;
    document.body.appendChild(indicator);
})();
