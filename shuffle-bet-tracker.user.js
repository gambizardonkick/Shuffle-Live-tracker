// ==UserScript==
// @name         Shuffle.com All Bets Tracker
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Track ALL bets on shuffle.com and send TheGoobr bets to Discord
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
    const BACKEND_URL = 'https://bd156f34-9fce-49b2-90d2-a044ad76fe9c-00-zuut6ynnxfx.sisko.replit.dev';
    const CHECK_INTERVAL = 3000;
    const AUTH_TOKEN = 'shuffle-tracker-2024';
    
    let processedBets = new Set();
    let isMonitoring = false;
    let betCount = 0;

    console.log('[Shuffle Tracker] Script loaded, monitoring ALL bets');

    // Function to send bet data to backend
    function sendBetToBackend(betData) {
        GM_xmlhttpRequest({
            method: 'POST',
            url: `${BACKEND_URL}/api/bet`,
            headers: {
                'Content-Type': 'application/json',
                'X-Auth-Token': AUTH_TOKEN
            },
            data: JSON.stringify(betData),
            onload: function(response) {
                if (response.status === 200) {
                    betCount++;
                    updateIndicator();
                    console.log('[Shuffle Tracker] Bet sent successfully:', betData.username);
                }
            },
            onerror: function(error) {
                console.error('[Shuffle Tracker] Error sending bet:', error);
            }
        });
    }

    // Create a stable bet ID from DOM attributes instead of timestamp
    function createStableBetId(element, username, amount, game) {
        const elementId = element.getAttribute('data-id') || 
                         element.getAttribute('id') || 
                         element.getAttribute('data-bet-id');
        
        if (elementId) {
            return `bet_${elementId}`;
        }
        
        const textContent = element.textContent.substring(0, 100);
        const hash = simpleHash(textContent + username + amount + game);
        return `bet_${username}_${hash}_${amount}_${game}`;
    }

    function simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    // Function to parse bet information from DOM
    function parseBetElement(betElement) {
        try {
            // Find username - try multiple selectors
            const usernameEl = betElement.querySelector('[data-testid*="username"], .username, a[href*="/user/"], [class*="username"]') ||
                             betElement.querySelector('a[href^="/user/"]') ||
                             betElement.querySelector('[class*="user"]');
            
            if (!usernameEl) return null;
            
            let username = usernameEl.textContent.trim();
            if (!username || username.length === 0) {
                const href = usernameEl.getAttribute('href');
                if (href) {
                    username = href.replace('/user/', '').trim();
                }
            }
            
            if (!username || username.length === 0) return null;
            
            // Find bet amount
            const amountEl = betElement.querySelector('[data-testid*="amount"], [class*="amount"], [class*="wager"]');
            const amount = amountEl ? amountEl.textContent.trim() : 'Unknown';
            
            // Find game type
            const gameEl = betElement.querySelector('[data-testid*="game"], [class*="game"], [class*="Game"]');
            const game = gameEl ? gameEl.textContent.trim() : 'Unknown';
            
            // Find multiplier/result
            const multiplierEl = betElement.querySelector('[data-testid*="multiplier"], [class*="multiplier"], [class*="payout"]');
            const multiplier = multiplierEl ? multiplierEl.textContent.trim() : 'Unknown';
            
            // Find profit
            const profitEl = betElement.querySelector('[data-testid*="profit"], [class*="profit"], [class*="win"]');
            const profit = profitEl ? profitEl.textContent.trim() : 'Unknown';
            
            // Try to get timestamp from DOM
            const timeEl = betElement.querySelector('[data-testid*="time"], [class*="time"], time');
            let timestamp = Date.now();
            if (timeEl) {
                const timeAttr = timeEl.getAttribute('datetime') || timeEl.getAttribute('data-time');
                if (timeAttr) {
                    timestamp = new Date(timeAttr).getTime();
                }
            }
            
            const betId = createStableBetId(betElement, username, amount, game);
            
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
            const betContainers = document.querySelectorAll(
                '[class*="ActivityBoard"] > div, ' +
                '[class*="bet-item"], ' +
                '[class*="BetItem"], ' +
                '[class*="activity-item"], ' +
                '[data-testid*="bet"], ' +
                'div[class*="bet"] > div, ' +
                'li[class*="activity"]'
            );
            
            if (betContainers.length > 0) {
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
            
            if (betData && betData.username) {
                if (!processedBets.has(betData.betId)) {
                    console.log('[Shuffle Tracker] New bet found:', betData.username, betData.amount);
                    processedBets.add(betData.betId);
                    sendBetToBackend(betData);
                    
                    if (processedBets.size > 2000) {
                        const toDelete = Array.from(processedBets).slice(0, 500);
                        toDelete.forEach(id => processedBets.delete(id));
                    }
                }
            }
        });
    }

    // Update visual indicator
    function updateIndicator() {
        const indicator = document.getElementById('shuffle-tracker-indicator');
        if (indicator) {
            indicator.textContent = `Tracking All Bets (${betCount} sent)`;
        }
    }

    // Start monitoring
    function startMonitoring() {
        if (isMonitoring) return;
        isMonitoring = true;
        
        console.log('[Shuffle Tracker] Starting monitoring for ALL bets...');
        
        scanForBets();
        setInterval(scanForBets, CHECK_INTERVAL);
        
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.addedNodes.length > 0) {
                    scanForBets();
                    break;
                }
            }
        });
        
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
    indicator.id = 'shuffle-tracker-indicator';
    indicator.style.cssText = 'position:fixed;top:10px;right:10px;background:#00ff00;color:#000;padding:8px 12px;border-radius:4px;z-index:999999;font-family:monospace;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
    indicator.textContent = `Tracking All Bets (0 sent)`;
    document.body.appendChild(indicator);
})();
