// ==UserScript==
// @name         Shuffle.com All Bets Tracker
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  Track ALL bets on shuffle.com instantly with complete data
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
    const AUTH_TOKEN = 'shuffle-tracker-2024';
    
    let processedBets = new Set();
    let betCount = 0;
    let errorCount = 0;

    console.log('[Shuffle Tracker] Script loaded - INSTANT tracking mode');

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
                    console.log('[Shuffle Tracker] ✅', betData.username, betData.game, betData.betAmountText, betData.multiplierText);
                } else {
                    errorCount++;
                    console.error('[Shuffle Tracker] ❌ Error:', response.status);
                }
            },
            onerror: function(error) {
                errorCount++;
                console.error('[Shuffle Tracker] ❌ Network error');
                updateIndicator();
            }
        });
    }

    function parseNumericValue(text) {
        if (!text) return 0;
        const cleaned = text.replace(/[\$,\s]/g, '').replace(/[^0-9.\-]/g, '');
        const value = parseFloat(cleaned);
        return isNaN(value) ? 0 : value;
    }

    function createStableBetId(rowElement, username, amount, game, multiplier, timestamp) {
        const textContent = rowElement.textContent.substring(0, 150);
        let hash = 0;
        for (let i = 0; i < textContent.length; i++) {
            const char = textContent.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return `bet_${Math.abs(hash).toString(36)}_${username}_${amount}_${game}_${multiplier}_${timestamp}`;
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
                    const href = userLink.getAttribute('href');
                    username = userLink.textContent.trim() || (href ? href.replace('/user/', '') : 'Unknown');
                } else {
                    const userText = userCell.textContent.trim();
                    if (userText && userText.length > 0) username = userText;
                }
            }

            let game = 'Unknown';
            const gameTitle = gameCell.querySelector('.GameTitle_root__R4XRF');
            if (gameTitle) {
                game = gameTitle.textContent.trim();
            } else {
                const gameButton = gameCell.querySelector('button');
                game = gameButton ? gameButton.textContent.trim() : gameCell.textContent.trim();
            }

            let betAmountText = '';
            const amountSpan = amountCell.querySelector('.FiatWithTooltip_evenlySpacedNumber__wQSLB, .fiat-with-tool-tip-text');
            betAmountText = amountSpan ? amountSpan.textContent.trim() : amountCell.textContent.trim();
            const betAmount = parseNumericValue(betAmountText);

            let multiplierText = '';
            const multiplierSpan = multiplierCell.querySelector('.MultiplierCell_root__Wd4zc span[style*="color"]');
            if (multiplierSpan) {
                multiplierText = multiplierSpan.textContent.trim();
            } else {
                const anyMultiplierSpan = multiplierCell.querySelector('span');
                multiplierText = anyMultiplierSpan ? anyMultiplierSpan.textContent.trim() : multiplierCell.textContent.trim();
            }
            const multiplier = parseNumericValue(multiplierText);

            let payoutText = '';
            const payoutSpan = payoutCell.querySelector('.FiatWithTooltip_evenlySpacedNumber__wQSLB, .fiat-with-tool-tip-text');
            payoutText = payoutSpan ? payoutSpan.textContent.trim() : payoutCell.textContent.trim();
            const payout = parseNumericValue(payoutText);

            const profit = payout;
            const isWin = payout > 0;
            const timestamp = Date.now();

            const betId = createStableBetId(rowElement, username, betAmount, game, multiplier, timestamp);

            return {
                betId,
                username,
                game,
                betAmount,
                betAmountText,
                multiplier,
                multiplierText,
                payout,
                payoutText,
                profit,
                isWin,
                timestamp,
                url: window.location.href
            };
        } catch (error) {
            console.error('[Shuffle Tracker] Parse error:', error);
            return null;
        }
    }

    function scanForBets() {
        const tableBody = document.querySelector('tbody[data-testid="table-body"]');
        if (!tableBody) return;

        const rows = tableBody.querySelectorAll('tr[aria-label="View detail"]');
        if (rows.length === 0) return;

        rows.forEach(row => {
            const betData = parseBetRow(row);
            
            if (betData && betData.username && betData.username !== 'Unknown') {
                if (!processedBets.has(betData.betId)) {
                    processedBets.add(betData.betId);
                    sendBetToBackend(betData);
                    
                    if (processedBets.size > 5000) {
                        const toDelete = Array.from(processedBets).slice(0, 2000);
                        toDelete.forEach(id => processedBets.delete(id));
                    }
                }
            }
        });
    }

    function updateIndicator() {
        const indicator = document.getElementById('shuffle-tracker-indicator');
        if (indicator) {
            const status = errorCount > 0 ? `⚠️ ${errorCount}` : '✅';
            indicator.textContent = `${status} ${betCount} sent`;
            indicator.style.background = errorCount > 3 ? '#ff0000' : '#00ff00';
        }
    }

    function startMonitoring() {
        console.log('[Shuffle Tracker] 🚀 Instant monitoring active');
        
        scanForBets();
        setInterval(scanForBets, 500);
        
        const observer = new MutationObserver(() => {
            scanForBets();
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startMonitoring);
    } else {
        startMonitoring();
    }

    const indicator = document.createElement('div');
    indicator.id = 'shuffle-tracker-indicator';
    indicator.style.cssText = 'position:fixed;top:10px;right:10px;background:#00ff00;color:#000;padding:10px 15px;border-radius:6px;z-index:999999;font-family:monospace;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,0.5);font-weight:bold;';
    indicator.textContent = `✅ 0 sent`;
    
    setTimeout(() => {
        document.body.appendChild(indicator);
    }, 100);
})();
