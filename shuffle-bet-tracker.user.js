// ==UserScript==
// @name         Shuffle.com All Bets Tracker
// @namespace    http://tampermonkey.net/
// @version      2.1
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

    const BACKEND_URL = 'https://bd156f34-9fce-49b2-90d2-a044ad76fe9c-00-zuut6ynnxfx.sisko.replit.dev';
    const CHECK_INTERVAL = 3000;
    const AUTH_TOKEN = 'shuffle-tracker-2024';
    
    let processedBets = new Set();
    let isMonitoring = false;
    let betCount = 0;
    let errorCount = 0;

    console.log('[Shuffle Tracker] Script loaded, monitoring ALL bets');

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
                    errorCount = 0;
                    updateIndicator();
                    console.log('[Shuffle Tracker] ✅ Bet sent:', betData.username, betData.amount);
                } else {
                    errorCount++;
                    console.error('[Shuffle Tracker] ❌ Server error:', response.status);
                }
            },
            onerror: function(error) {
                errorCount++;
                console.error('[Shuffle Tracker] ❌ Network error:', error);
                updateIndicator();
            }
        });
    }

    function createStableBetId(rowElement, username, amount, game) {
        const textContent = rowElement.textContent.substring(0, 150);
        const hash = simpleHash(textContent);
        return `bet_${hash}_${username}_${amount}_${game}`;
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

    function parseBetRow(rowElement) {
        try {
            const cells = rowElement.querySelectorAll('td');
            if (cells.length < 5) return null;

            const userCell = cells[0];
            const gameCell = cells[1];
            const amountCell = cells[2];
            const multiplierCell = cells[3];
            const payoutCell = cells[4];

            let username = 'Unknown';
            const anonymousDiv = userCell.querySelector('.AnonymousUser_root__4chUx');
            if (anonymousDiv) {
                const textSpan = anonymousDiv.querySelector('.AnonymousUser_text__0E_PM');
                username = textSpan ? textSpan.textContent.trim() : 'Hidden';
            } else {
                const userLink = userCell.querySelector('a[href*="/user/"]');
                if (userLink) {
                    username = userLink.textContent.trim() || userLink.getAttribute('href').replace('/user/', '');
                } else {
                    const userSpan = userCell.querySelector('span');
                    if (userSpan) username = userSpan.textContent.trim();
                }
            }

            let game = 'Unknown';
            const gameTitle = gameCell.querySelector('.GameTitle_root__R4XRF');
            if (gameTitle) {
                game = gameTitle.textContent.trim();
            } else {
                const gameButton = gameCell.querySelector('button');
                if (gameButton) game = gameButton.textContent.trim();
            }

            let amount = 'Unknown';
            const amountSpan = amountCell.querySelector('.FiatWithTooltip_evenlySpacedNumber__wQSLB, .fiat-with-tool-tip-text');
            if (amountSpan) {
                amount = amountSpan.textContent.trim();
            }

            let multiplier = 'Unknown';
            const multiplierSpan = multiplierCell.querySelector('.MultiplierCell_root__Wd4zc span');
            if (multiplierSpan) {
                multiplier = multiplierSpan.textContent.trim();
            }

            let payout = 'Unknown';
            const payoutSpan = payoutCell.querySelector('.FiatWithTooltip_evenlySpacedNumber__wQSLB, .fiat-with-tool-tip-text');
            if (payoutSpan) {
                payout = payoutSpan.textContent.trim();
            }

            const betId = createStableBetId(rowElement, username, amount, game);
            const timestamp = Date.now();

            return {
                betId,
                username,
                amount,
                game,
                multiplier,
                profit: payout,
                timestamp,
                url: window.location.href
            };
        } catch (error) {
            console.error('[Shuffle Tracker] Error parsing bet row:', error);
            return null;
        }
    }

    function scanForBets() {
        try {
            const tableBody = document.querySelector('tbody[data-testid="table-body"]');
            
            if (!tableBody) {
                console.log('[Shuffle Tracker] Table not found yet...');
                return;
            }

            const rows = tableBody.querySelectorAll('tr[aria-label="View detail"]');
            
            if (rows.length === 0) {
                console.log('[Shuffle Tracker] No bet rows found');
                return;
            }

            console.log(`[Shuffle Tracker] Found ${rows.length} bet rows`);
            
            rows.forEach(row => {
                const betData = parseBetRow(row);
                
                if (betData && betData.username && betData.username !== 'Unknown') {
                    if (!processedBets.has(betData.betId)) {
                        console.log('[Shuffle Tracker] 🆕 New bet:', betData.username, betData.game, betData.amount);
                        processedBets.add(betData.betId);
                        sendBetToBackend(betData);
                        
                        if (processedBets.size > 2000) {
                            const toDelete = Array.from(processedBets).slice(0, 500);
                            toDelete.forEach(id => processedBets.delete(id));
                        }
                    }
                }
            });
        } catch (error) {
            console.error('[Shuffle Tracker] Error in scanForBets:', error);
        }
    }

    function updateIndicator() {
        const indicator = document.getElementById('shuffle-tracker-indicator');
        if (indicator) {
            const status = errorCount > 0 ? `⚠️ ${errorCount} errors` : '✅';
            indicator.textContent = `${status} Tracking All Bets (${betCount} sent)`;
            indicator.style.background = errorCount > 3 ? '#ff0000' : '#00ff00';
        }
    }

    function startMonitoring() {
        if (isMonitoring) return;
        isMonitoring = true;
        
        console.log('[Shuffle Tracker] Starting monitoring for ALL bets...');
        
        setTimeout(() => {
            scanForBets();
            setInterval(scanForBets, CHECK_INTERVAL);
        }, 2000);
        
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.addedNodes.length > 0) {
                    const hasTableChanges = Array.from(mutation.addedNodes).some(node => 
                        node.nodeType === 1 && (
                            node.matches && node.matches('tr[aria-label="View detail"]') ||
                            node.querySelector && node.querySelector('tr[aria-label="View detail"]')
                        )
                    );
                    
                    if (hasTableChanges) {
                        setTimeout(scanForBets, 500);
                        break;
                    }
                }
            }
        });
        
        const targetNode = document.body;
        observer.observe(targetNode, {
            childList: true,
            subtree: true
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(startMonitoring, 3000);
        });
    } else {
        setTimeout(startMonitoring, 3000);
    }

    const indicator = document.createElement('div');
    indicator.id = 'shuffle-tracker-indicator';
    indicator.style.cssText = 'position:fixed;top:10px;right:10px;background:#00ff00;color:#000;padding:8px 12px;border-radius:4px;z-index:999999;font-family:monospace;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-weight:bold;';
    indicator.textContent = `✅ Tracking All Bets (0 sent)`;
    
    setTimeout(() => {
        document.body.appendChild(indicator);
    }, 1000);
})();
