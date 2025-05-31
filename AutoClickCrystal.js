// SCRIPT START //
// ==UserScript==
// @name              Auto Click Crystals & Anti-AFK (v2.0.0 - Improved Anti-Detection)
// @namespace         http://tampermonkey.net/
// @version           2.0.0
// @description       Детальне логування для виявлення діаманта в повідомленні. Покращена версія зі зниженим ризиком блокування.
// @author            Kavernatiastasi (assisted by AI)
// @match             https://asstars.club/*
// @match             https://asstars1.astars.club/*
// @match             https://animestars.org/*
// @match             https://asstars.tv/*
// @grant             GM_xmlhttpRequest
// @grant             unsafeWindow
// @connect           telegram-webhook.kavernatiastasi.workers.dev
// ==/UserScript==

(function () {
    'use strict';
    // console.log("[AutoCrystalScript] SCRIPT EXECUTION STARTED (v2.0.0 Improved Anti-Detection)");

    const CONFIG = {
        CHAT_MESSAGE_SELECTOR: ".lc_chat_li",
        CHAT_MESSAGE_LIST_SELECTOR: "#lc_chat",
        CHAT_AUTHOR_SELECTOR: ".lc_chat_li_autor",
        DIAMOND_SELECTOR: "#diamonds-chat",
        TIME_SELECTOR: ".lc_chat_li_date",
        CHAT_ACTIVITY_AREA_SELECTOR: ".lc_area",
        POPUP_CLOSE_SELECTORS: [
            ".DLEPush-close", ".modal-content .close", ".modal-close",
            ".notification-close", ".close-btn", "[data-dismiss='modal']"
        ],
        CRYSTAL_BOT_NAME_LC: "ии космический посикунчик",
        SCRIPT_STATE_KEY: "autoCrystalObserverNotifyActive_v2_0_0", // MODIFIED: Version bump
        CLICKED_TIMESTAMPS_KEY: "autoCrystalClickedTimestamps_v2_0_0", // MODIFIED: Version bump
        CONTROL_BUTTON_ID: "auto-crystal-toggle-button",
        INFO_PANEL_ID: "crystal-info-panel",
        MAX_STORED_TIMESTAMPS: 50,
        NOTIFICATION_ICON_URL: "",
        NOTIFICATION_TIMEOUT: 10000,
        AFK_MOUSE_SIM_BASE_INTERVAL_MS: 20000, // MODIFIED: Renamed to base
        AFK_MOUSE_SIM_RANDOM_OFFSET_MS: 7000,  // NEW: Random offset for AFK
        POPUP_CLOSE_BASE_INTERVAL_MS: 5000,    // MODIFIED: Renamed to base
        POPUP_CLOSE_RANDOM_OFFSET_MS: 2000,    // NEW: Random offset for popups
        CARD_ELEMENT_SELECTOR: ".card-notification__wrapper",
        CARD_POPUP_CLOSE_BUTTON_SELECTOR: ".ui-icon-closethick",
        CARD_POPUP_CLOSE_DELAY_MS: 2000,
        ENABLE_TELEGRAM_NOTIFICATIONS: true,
        WORKER_WEBHOOK_URL: "https://telegram-webhook.kavernatiastasi.workers.dev/",
        DEBUG_LOGS: false,
        // NEW: Click related timings
        CLICK_DELAY_MIN_MS: 250,
        CLICK_DELAY_MAX_MS: 750,
        ACTION_COOLDOWN_MS: 1500, // Мінімальний інтервал між основними діями (кристали, карти)
        POPUP_CLICK_DELAY_MIN_MS: 100,
        POPUP_CLICK_DELAY_MAX_MS: 300
    };

    let isScriptActive;
    // MODIFIED: Changed interval IDs to timeout IDs
    let afkMouseSimTimeoutId = null;
    let popupCloseTimeoutId = null;
    let controlButton = null;
    let controlButtonPulseIntervalId = null;
    let clickedCrystalTimestamps = new Set();
    let crystalObserver = null;
    let crystalCount = 0;
    let lastCrystalTimestamp = "N/A";
    let infoPanelElement = null;
    let cardFeatureObserver = null;

    // NEW: Timestamp for the last major action to implement cooldown
    let lastMajorActionTimestamp = 0;

    const powerOnIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 5px; vertical-align: middle;"><path d="M16.56 5.44l-1.45-1.45C13.95 2.83 12 2 12 2s-1.95.83-3.11 1.99L7.44 5.44C5.2 6.95 4.01 9.58 4.01 12.5c0 3.93 3.24 7.16 7.27 7.47l.01.53H11v2h2v-2h-.28l-.01-.53C16.76 19.66 20 16.43 20 12.5c0-2.92-1.19-5.55-3.44-7.06zM12 20c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z"></path><path d="M12 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"></path></svg>`;
    const powerOffIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 5px; vertical-align: middle;"><path d="M16.56 5.44l-1.45-1.45C13.95 2.83 12 2 12 2s-1.95.83-3.11 1.99L7.44 5.44C5.2 6.95 4.01 9.58 4.01 12.5c0 3.93 3.24 7.16 7.27 7.47l.01.53H11v2h2v-2h-.28l-.01-.53C16.76 19.66 20 16.43 20 12.5c0-2.92-1.19-5.55-3.44-7.06zM12 18c-2.21 0-4-1.79-4-4s1.79-4 4-4c.75 0 1.42.21 2 .59V9.28C13.47 9.1 12.75 9 12 9c-3.31 0-6 2.69-6 6s2.69 6 6 6c.75 0 1.47-.1 2.14-.28v-1.31c-.58.38-1.25.59-2 .59z"></path></svg>`;

    // NEW: Helper function for random delays
    function getRandomDelay(minMs, maxMs) {
        return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    }

    function log(message, type = "info") {
        const prefix = "[AutoCrystalScript]";
        if (type === "error") {
            console.error(prefix, message);
            return;
        }
        if (CONFIG.DEBUG_LOGS) {
            switch (type) {
                case "warn": console.warn(prefix, message); break;
                case "debug": console.log(prefix, message); break;
                case "info": default: console.log(prefix, message); break;
            }
        }
    }

    function loadState() {
        log("DEBUG: loadState CALLED", "debug");
        const savedState = localStorage.getItem(CONFIG.SCRIPT_STATE_KEY);
        try {
            isScriptActive = (savedState === null) ? true : JSON.parse(savedState);
        } catch (e) {
            log(`ERROR in loadState parsing SCRIPT_STATE_KEY: ${e.message}`, "error");
            isScriptActive = true;
        }
        try {
            const savedTimestamps = localStorage.getItem(CONFIG.CLICKED_TIMESTAMPS_KEY);
            clickedCrystalTimestamps = new Set(savedTimestamps ? JSON.parse(savedTimestamps) : []);
            if (clickedCrystalTimestamps.size > CONFIG.MAX_STORED_TIMESTAMPS) {
                const timestampsArray = Array.from(clickedCrystalTimestamps);
                const toKeep = timestampsArray.slice(timestampsArray.length - CONFIG.MAX_STORED_TIMESTAMPS);
                clickedCrystalTimestamps = new Set(toKeep);
                saveClickedTimestamps();
            }
            log(`Завантажено ${clickedCrystalTimestamps.size} міток часу натиснутих кристалів.`, "debug");
        } catch (e) {
            log("Помилка завантаження збережених міток часу: " + e.message, "error");
            clickedCrystalTimestamps = new Set();
        }
        crystalCount = 0;
        lastCrystalTimestamp = "N/A";
        lastMajorActionTimestamp = 0; // NEW: Reset cooldown timestamp on load
        log("DEBUG: loadState FINISHED - final isScriptActive: " + isScriptActive, "debug");
    }

    function saveClickedTimestamps() {
        try {
            localStorage.setItem(CONFIG.CLICKED_TIMESTAMPS_KEY, JSON.stringify([...clickedCrystalTimestamps]));
        } catch (e) {
            log("Помилка збереження міток часу: " + e.message, "error");
        }
    }

    function getTimestampString(timeElement) {
        if (!timeElement) return null;
        const text = timeElement.textContent.trim();
        const match = text.match(/(\d{2}:\d{2})$/);
        return match ? match[1] : null;
    }

    function showNotification(title, body, icon = CONFIG.NOTIFICATION_ICON_URL) {
        // ... (no changes to this function's core logic)
        if (!isScriptActive) return;
        const showActualNotification = () => {
            try {
                const notification = new Notification(title, { body, icon, silent: true });
                setTimeout(() => notification.close(), CONFIG.NOTIFICATION_TIMEOUT);
            } catch (e) {
                log("Помилка при створенні сповіщення: " + e.message, "error");
            }
        };
        try {
            if (!("Notification" in window)) {
                log("Цей браузер не підтримує системні сповіщення.", "warn");
            } else if (Notification.permission === "granted") {
                showActualNotification();
            } else if (Notification.permission !== "denied") {
                Notification.requestPermission().then((permission) => {
                    if (permission === "granted") {
                        log("Дозвіл на сповіщення надано.", "info");
                        showActualNotification();
                    } else {
                        log("Користувач відхилив дозвіл на сповіщення.", "warn");
                    }
                }).catch(err => {
                    log("Помилка запиту дозволу на сповіщення: " + err.message, "error");
                });
            } else {
                log("Дозвіл на сповіщення заблоковано користувачем.", "warn");
            }
        } catch (e) {
            log("Загальна помилка в showNotification: " + e.message, "error");
        }
    }

    function sendTelegramNotificationViaWorker(messageText, eventId) {
        // ... (no changes to this function's core logic)
        if (!CONFIG.ENABLE_TELEGRAM_NOTIFICATIONS || !CONFIG.WORKER_WEBHOOK_URL) {
            log("Telegram сповіщення через Worker вимкнені або URL не вказано.", "debug");
            return;
        }
        log(`[TelegramWorker] Спроба надіслати сповіщення: "${messageText}" (Event ID: ${eventId})`, "info");
        GM_xmlhttpRequest({
            method: "POST",
            url: CONFIG.WORKER_WEBHOOK_URL,
            data: JSON.stringify({
                message: messageText,
                parse_mode: "MarkdownV2",
                event_id: eventId
            }),
            headers: { "Content-Type": "application/json" },
            onload: function(response) {
                if (response.status >= 200 && response.status < 300) {
                    log(`[TelegramWorker] Запит на Worker успішний (Event ID: ${eventId}): ${response.statusText} - ${response.responseText}`, "info");
                } else {
                    log(`[TelegramWorker] Помилка запиту на Worker (Event ID: ${eventId}): ${response.status} ${response.statusText} - ${response.responseText}`, "error");
                }
            },
            onerror: function(response) {
                log(`[TelegramWorker] Критична помилка запиту на Worker (Event ID: ${eventId}): ${response.statusText} - ${response.responseText}`, "error");
            }
        });
    }

    function processSingleMessage(msgElement) {
        log(`DEBUG: processSingleMessage called for element: <${msgElement.tagName.toLowerCase()} class="${msgElement.className}">`, "debug");
        if (!isScriptActive || !msgElement || typeof msgElement.matches !== 'function' || !msgElement.matches(CONFIG.CHAT_MESSAGE_SELECTOR)) return;

        try {
            const timeElement = msgElement.querySelector(CONFIG.TIME_SELECTOR);
            const timestamp = getTimestampString(timeElement);
            if (!timestamp || clickedCrystalTimestamps.has(timestamp)) return;

            const authorElement = msgElement.querySelector(CONFIG.CHAT_AUTHOR_SELECTOR);
            const authorText = authorElement ? authorElement.textContent.trim().toLowerCase() : null;

            if (authorText === CONFIG.CRYSTAL_BOT_NAME_LC) {
                log(`DEBUG: Potential crystal message from "${authorText}". Checking for diamond...`, "debug");
                let diamondElement = msgElement.querySelector(CONFIG.DIAMOND_SELECTOR) ||
                                     msgElement.querySelector(".diamond-chat") ||
                                     msgElement.querySelector(".diamond") ||
                                     msgElement.querySelector("div[data-code]");

                if (diamondElement) {
                    // NEW: Cooldown check
                    const currentTime = Date.now();
                    if (currentTime - lastMajorActionTimestamp < CONFIG.ACTION_COOLDOWN_MS) {
                        log(`[Cooldown] Пропуск кліку на кристал (ID: ${timestamp}), ще не минув інтервал (${(CONFIG.ACTION_COOLDOWN_MS - (currentTime - lastMajorActionTimestamp))/1000}с залишилось).`, "debug");
                        return;
                    }

                    log(`[Observer] 💎 Знайдено кристал від '${CONFIG.CRYSTAL_BOT_NAME_LC}' (${timestamp}), планую клік...`, "info");

                    // MODIFIED: Added random delay before click
                    setTimeout(() => {
                        if (!isScriptActive) { // Re-check script status
                            log("DEBUG: processSingleMessage - Script deactivated during delay, aborting click.", "debug");
                            return;
                        }
                        lastMajorActionTimestamp = Date.now(); // Update timestamp right before action

                        log(`[Observer] Клікаю на кристал ID: ${timestamp} після затримки. Елемент: ${diamondElement.outerHTML.substring(0,100)}`, "info");
                        diamondElement.click();
                        crystalCount++;
                        lastCrystalTimestamp = timestamp;
                        updateCrystalInfoPanel();
                        clickedCrystalTimestamps.add(timestamp);
                        if (clickedCrystalTimestamps.size > CONFIG.MAX_STORED_TIMESTAMPS) {
                            const firstTimestamp = clickedCrystalTimestamps.values().next().value;
                            clickedCrystalTimestamps.delete(firstTimestamp);
                        }
                        saveClickedTimestamps();

                        const browserNotificationTitle = '💎 Собран кристалл!';
                        const browserNotificationBody = `Количество за сессию: ${crystalCount} (в ${timestamp})`;
                        showNotification(browserNotificationTitle, browserNotificationBody);

                        const crystalEmoji = "💎";
                        const telegramMessageText = `${crystalEmoji} *Опа, камень в чате* ${timestamp}`;
                        const eventId = `crystal_${timestamp.replace(":", "")}`;
                        sendTelegramNotificationViaWorker(telegramMessageText, eventId);
                        log("DEBUG: processSingleMessage - Crystal processed and notifications sent.", "debug");

                    }, getRandomDelay(CONFIG.CLICK_DELAY_MIN_MS, CONFIG.CLICK_DELAY_MAX_MS));
                } else {
                    log(`DEBUG: processSingleMessage - CRITICAL: Diamond element NOT FOUND for crystal bot message. msgElement innerHTML (first 500 chars): ${msgElement.innerHTML.substring(0,500)}`, "warn");
                }
            }
        } catch (error) {
            log(`Помилка в processSingleMessage: ${error.message}`, "error");
            console.error(error);
        }
    }

    function scanExistingMessagesForCrystals() {
        // ... (no changes to this function's core logic)
        if (!isScriptActive) return;
        log("🔍 Початкове сканування існуючих повідомлень...", "debug");
        try {
            document.querySelectorAll(CONFIG.CHAT_MESSAGE_SELECTOR).forEach(msg => processSingleMessage(msg));
        } catch (error) {
            log("Помилка під час початкового сканування: " + error.message, "error");
        }
        log("✅ Початкове сканування завершено.", "debug");
    }

    function setupCrystalObserver() {
        // ... (no changes to this function's core logic)
         if (!isScriptActive || crystalObserver) return;
        const targetNode = document.querySelector(CONFIG.CHAT_MESSAGE_LIST_SELECTOR);
        if (!targetNode) {
            log(`Не знайдено контейнер чату ('${CONFIG.CHAT_MESSAGE_LIST_SELECTOR}') для MutationObserver кристалів.`, "error");
            return;
        }
        const callback = function(mutationsList, observer) {
            if (!isScriptActive) return;
            for(const mutation of mutationsList) {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1) {
                            if (node.matches(CONFIG.CHAT_MESSAGE_SELECTOR)) {
                                processSingleMessage(node);
                            } else if (node.querySelectorAll) {
                                node.querySelectorAll(CONFIG.CHAT_MESSAGE_SELECTOR).forEach(msg => processSingleMessage(msg));
                            }
                        }
                    });
                }
            }
        };
        crystalObserver = new MutationObserver(callback);
        try {
            crystalObserver.observe(targetNode, { childList: true });
            log(`👀 MutationObserver кристалів запущено для '${CONFIG.CHAT_MESSAGE_LIST_SELECTOR}'.`, "info");
        } catch (error) {
            log(`Помилка запуску MutationObserver кристалів: ${error.message}`, "error");
            crystalObserver = null;
        }
    }

    function simulateMouseActivityInChat() {
        if (!isScriptActive) return;
        try {
            const chatArea = document.querySelector(CONFIG.CHAT_ACTIVITY_AREA_SELECTOR);
            if (!chatArea) {
                log("DEBUG: simulateMouseActivityInChat - chatArea not found.", "debug");
                return;
            }
            const rect = chatArea.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) {
                log("DEBUG: simulateMouseActivityInChat - chatArea has zero dimensions.", "debug");
                return;
            }
            const clientX = rect.left + Math.random() * rect.width;
            const clientY = rect.top + Math.random() * rect.height;
            const mouseMoveEvent = new MouseEvent('mousemove', {
                bubbles: true, cancelable: true, view: unsafeWindow,
                clientX: clientX, clientY: clientY
            });
            chatArea.dispatchEvent(mouseMoveEvent);
            log(`💨 Симульовано рух миші над '${CONFIG.CHAT_ACTIVITY_AREA_SELECTOR}'`, "debug");
        } catch (error) {
            log(`Помилка в simulateMouseActivityInChat: ${error.message}`, "error");
        }
    }

    function closePopups() {
        if (!isScriptActive) return;
        try {
            for (const selector of CONFIG.POPUP_CLOSE_SELECTORS) {
                const popupCloseButton = document.querySelector(selector);
                if (popupCloseButton && popupCloseButton.offsetParent !== null) { // Check if visible
                    log(`❌ Знайдено спливаюче вікно/повідомлення (селектор '${selector}'), планую закриття!`, "debug");
                    // MODIFIED: Added random delay before click
                    setTimeout(() => {
                        if (!isScriptActive) return; // Re-check
                        log(`Закриваю спливаюче вікно (селектор '${selector}') після затримки.`, "debug");
                        popupCloseButton.click();
                    }, getRandomDelay(CONFIG.POPUP_CLICK_DELAY_MIN_MS, CONFIG.POPUP_CLICK_DELAY_MAX_MS));
                }
            }
        } catch (error) {
            log("Помилка в closePopups: " + error.message, "error");
        }
    }

    function createCrystalInfoPanel() { /* ... (no changes) ... */
        if (document.getElementById(CONFIG.INFO_PANEL_ID)) return;
        const chatListElement = document.querySelector(CONFIG.CHAT_MESSAGE_LIST_SELECTOR);
        if (!chatListElement) {
            log(`Інфо-панель не буде створено, оскільки чат ('${CONFIG.CHAT_MESSAGE_LIST_SELECTOR}') не знайдено.`, "info");
            removeCrystalInfoPanel();
            return;
        }
        infoPanelElement = document.createElement('div');
        infoPanelElement.id = CONFIG.INFO_PANEL_ID;
        infoPanelElement.innerHTML = `
            <span style="opacity: 0.8;">💎 Собрано:</span>
            <strong id="crystal-count-display" style="margin-left: 5px;">0</strong>
            <br>
            <span style="opacity: 0.8; font-size: 11px;">Последний:</span>
            <span id="last-crystal-time-display" style="margin-left: 5px; font-size: 11px;">N/A</span>
        `;
        Object.assign(infoPanelElement.style, {
            position: 'fixed', bottom: '15px', left: '15px',
            backgroundColor: 'rgba(0, 0, 0, 0.75)', color: '#f0f0f0',
            padding: '8px 12px', borderRadius: '8px',
            fontFamily: '"Segoe UI", Roboto, sans-serif', fontSize: '13px',
            lineHeight: '1.4', zIndex: '10001',
            boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
            border: '1px solid rgba(255, 255, 255, 0.1)', opacity: '0.9',
            transition: 'opacity 0.3s', display: 'block'
        });
        document.body.appendChild(infoPanelElement);
        log(`Інфо-панель створено (чат '${CONFIG.CHAT_MESSAGE_LIST_SELECTOR}' знайдено).`, "info");
        updateCrystalInfoPanel();
    }
    function updateCrystalInfoPanel() { /* ... (no changes) ... */
        if (!infoPanelElement) infoPanelElement = document.getElementById(CONFIG.INFO_PANEL_ID);
        if (infoPanelElement) {
            const countDisplay = infoPanelElement.querySelector('#crystal-count-display');
            const timeDisplay = infoPanelElement.querySelector('#last-crystal-time-display');
            if (countDisplay) countDisplay.textContent = crystalCount;
            if (timeDisplay) timeDisplay.textContent = lastCrystalTimestamp;
        }
    }
    function removeCrystalInfoPanel() { /* ... (no changes) ... */
        const panel = document.getElementById(CONFIG.INFO_PANEL_ID);
        if (panel) {
            panel.remove();
            log("Інфо-панель видалено.", "info");
        }
        infoPanelElement = null;
    }
    function createControlButton() { /* ... (no changes other than those already in your v1.9.9) ... */
        log("DEBUG: createControlButton called", "debug");
        let existingButton = document.getElementById(CONFIG.CONTROL_BUTTON_ID);
        if (existingButton) {
            controlButton = existingButton;
            log("DEBUG: createControlButton - existing button found", "debug");
        } else {
            controlButton = document.createElement('button');
            controlButton.id = CONFIG.CONTROL_BUTTON_ID;
            log("DEBUG: createControlButton - new button created", "debug");
        }

        Object.assign(controlButton.style, {
            padding: '6px 12px', fontSize: '13px', color: 'white',
            fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            fontWeight: '500', border: 'none', borderRadius: '6px', cursor: 'pointer',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            transition: 'background 0.2s ease, opacity 0.2s ease',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            verticalAlign: 'middle', minWidth: 'auto'
        });

        const lcButtonsContainer = document.querySelector('.lc_buttons');
        const chatOverallContainer = document.querySelector(CONFIG.CHAT_MESSAGE_LIST_SELECTOR);
        log(`DEBUG: createControlButton - lcButtonsContainer: ${lcButtonsContainer}`, "debug");
        log(`DEBUG: createControlButton - chatOverallContainer: ${chatOverallContainer}`, "debug");

        if (lcButtonsContainer && chatOverallContainer) {
            log("DEBUG: createControlButton - EMBEDDING button branch", "debug");
            controlButton.style.position = ''; controlButton.style.top = ''; controlButton.style.right = ''; controlButton.style.zIndex = '';
            controlButton.style.marginLeft = '8px'; controlButton.style.marginRight = '8px';

            let alreadyInPlace = false;
            if (existingButton && existingButton.parentElement === lcButtonsContainer) {
                 alreadyInPlace = true;
                 log("DEBUG: createControlButton - Existing button already in .lc_buttons", "debug");
            }

            if (!alreadyInPlace) {
                if(controlButton.parentElement) controlButton.parentElement.removeChild(controlButton);
                const symbolsSpan = lcButtonsContainer.querySelector('.lc_symb_left');
                if (symbolsSpan) {
                    lcButtonsContainer.insertBefore(controlButton, symbolsSpan);
                    log("DEBUG: createControlButton - Inserted before .lc_symb_left", "debug");
                } else {
                    const sendLink = lcButtonsContainer.querySelector('.lc_add');
                    if (sendLink && sendLink.nextSibling) {
                        lcButtonsContainer.insertBefore(controlButton, sendLink.nextSibling);
                        log("DEBUG: createControlButton - Inserted after .lc_add (before its nextSibling)", "debug");
                    } else if (sendLink) {
                        lcButtonsContainer.appendChild(controlButton);
                        log("DEBUG: createControlButton - Appended after .lc_add (as last child)", "debug");
                    } else {
                        lcButtonsContainer.appendChild(controlButton);
                        log("DEBUG: createControlButton - Appended to .lc_buttons (no .lc_add or .lc_symb_left found)", "debug");
                    }
                }
            }
        } else {
            log("DEBUG: createControlButton - FALLBACK (fixed/hidden) button branch", "debug");
            controlButton.style.position = 'fixed'; controlButton.style.top = '120px'; controlButton.style.right = '15px';
            controlButton.style.zIndex = '10002'; controlButton.style.minWidth = '160px';
            controlButton.style.padding = '10px 18px'; controlButton.style.fontSize = '15px'; controlButton.style.borderRadius = '50px';

            if (!chatOverallContainer) {
                controlButton.style.display = 'none';
                log("DEBUG: createControlButton - HIDING button (no chatOverallContainer for fixed button)", "debug");
            } else {
                controlButton.style.display = 'flex';
                log("DEBUG: createControlButton - SHOWING fixed button (chatOverallContainer present, but no .lc_buttons)", "debug");
            }
            if (controlButton.parentElement !== document.body) {
                 if(controlButton.parentElement) controlButton.parentElement.removeChild(controlButton);
                 document.body.appendChild(controlButton);
                 log("DEBUG: createControlButton - Appended to document.body (fixed positioning)", "debug");
            } else if (!controlButton.parentElement) {
                 document.body.appendChild(controlButton);
                 log("DEBUG: createControlButton - NEW button appended to document.body (fixed positioning)", "debug");
            }
        }

        if (controlButton) {
             log(`DEBUG: createControlButton - final parent: ${controlButton.parentElement ? controlButton.parentElement.outerHTML.substring(0,100) + "..." : "null"}`, "debug");
             log(`DEBUG: createControlButton - final display style: ${controlButton.style.display}`, "debug");
             log(`DEBUG: createControlButton - final visibility: ${controlButton.style.visibility}, opacity: ${controlButton.style.opacity}`, "debug");
        } else {
             log("DEBUG: createControlButton - controlButton is NULL at the end (THIS SHOULD NOT HAPPEN)", "error");
        }
        updateButtonAppearance();

        if (!controlButton.dataset.listenerAttached) {
            controlButton.addEventListener('click', () => {
                if (controlButton.disabled) return;
                controlButton.disabled = true; // Disable temporarily
                // MODIFIED: Slight delay to allow visual feedback before heavy processing
                setTimeout(() => {
                    if (isScriptActive) { deactivateFeatures(); } else { activateFeatures(); }
                    // controlButton.disabled = false; // Re-enable will be handled by activate/deactivate
                }, 50);
            });
            controlButton.addEventListener('mouseenter', () => { if (!controlButton.disabled && controlButton.style.display !== 'none') { controlButton.style.opacity = '0.85'; } });
            controlButton.addEventListener('mouseleave', () => { if (!controlButton.disabled && controlButton.style.display !== 'none') { controlButton.style.opacity = '1'; } });
            controlButton.addEventListener('mousedown', () => { if (!controlButton.disabled && controlButton.style.display !== 'none') { controlButton.style.opacity = '0.7'; } });
            controlButton.addEventListener('mouseup', () => { if (!controlButton.disabled && controlButton.style.display !== 'none') { controlButton.style.opacity = controlButton.matches(':hover') ? '0.85' : '1'; } });
            controlButton.dataset.listenerAttached = 'true';
        }
    }
    function updateButtonAppearance() { /* ... (no changes other than those already in your v1.9.9) ... */
        log(`DEBUG: updateButtonAppearance called. isScriptActive: ${isScriptActive}`, "debug");
        if (!controlButton) {
            log("DEBUG: updateButtonAppearance - EXITING, controlButton is null.", "debug");
            return;
        }

        if (controlButtonPulseIntervalId) {
            clearInterval(controlButtonPulseIntervalId);
            controlButtonPulseIntervalId = null;
        }

        if (isScriptActive) {
            log("DEBUG: updateButtonAppearance - Script is ACTIVE. Setting ON appearance.", "debug");
            controlButton.innerHTML = `${powerOnIconSVG} Авто: ON`;
            controlButton.style.background = 'linear-gradient(135deg, #28a745 0%, #218838 100%)';

            if (controlButton.style.position === 'fixed') {
                controlButton.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
                let pulseOut = true;
                controlButtonPulseIntervalId = setInterval(() => {
                    if (!isScriptActive || !controlButton || controlButton.style.display === 'none') {
                        if (controlButtonPulseIntervalId) clearInterval(controlButtonPulseIntervalId);
                        controlButtonPulseIntervalId = null;
                        if (controlButton) controlButton.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
                        return;
                    }
                    controlButton.style.boxShadow = pulseOut
                        ? '0 6px 14px rgba(33, 136, 56, 0.5), 0 0 0 2px rgba(40, 167, 69, 0.3)'
                        : '0 4px 8px rgba(0, 0, 0, 0.2)';
                    pulseOut = !pulseOut;
                }, 800);
            } else {
                 controlButton.style.boxShadow = '0 1px 3px rgba(0,0,0,0.15)';
            }
        } else {
            log("DEBUG: updateButtonAppearance - Script is INACTIVE. Setting OFF appearance.", "debug");
            controlButton.innerHTML = `${powerOffIconSVG} Авто: OFF`;
            controlButton.style.background = 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)';

            if (controlButton.style.position === 'fixed') {
                 controlButton.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
            } else {
                 controlButton.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
            }
        }
        log(`DEBUG: updateButtonAppearance - final button background: ${controlButton.style.background}`, "debug");
        if(controlButton.innerHTML) {
             log(`DEBUG: updateButtonAppearance - final button innerHTML length: ${controlButton.innerHTML.length}`, "debug");
        } else {
            log("DEBUG: updateButtonAppearance - final button innerHTML is empty or null", "debug");
        }
    }

    function tryCloseCardPopup() {
        // ... (no changes, but will be called after a delay from handleCardElementAppearance)
        if (!isScriptActive) return;
        const closeButton = document.querySelector(CONFIG.CARD_POPUP_CLOSE_BUTTON_SELECTOR);
        if (closeButton && closeButton.offsetParent !== null) {
            log(`[CardFeature] Знайдено кнопку закриття попапу карти ('${CONFIG.CARD_POPUP_CLOSE_BUTTON_SELECTOR}'), клікаємо.`, "info");
            try {
                closeButton.click(); // This click could also get a small random delay if needed
                log(`[CardFeature] Кнопку закриття попапу карти натиснуто.`, "info");
            } catch (e) {
                log(`[CardFeature] Помилка при кліку на кнопку закриття попапу: ${e.message}`, "error");
            }
        } else {
            log(`[CardFeature] Кнопку закриття попапу карти ('${CONFIG.CARD_POPUP_CLOSE_BUTTON_SELECTOR}') не знайдено або вона невидима.`, "warn");
        }
    }

    function handleCardElementAppearance(cardElementNode) {
        if (!isScriptActive) return;

        // NEW: Cooldown check
        const currentTime = Date.now();
        if (currentTime - lastMajorActionTimestamp < CONFIG.ACTION_COOLDOWN_MS) {
            log(`[CardFeature][Cooldown] Пропуск кліку на карту, ще не минув інтервал (${(CONFIG.ACTION_COOLDOWN_MS - (currentTime - lastMajorActionTimestamp))/1000}с залишилось).`, "debug");
            return;
        }

        log(`[CardFeature] Знайдено елемент карти ('${CONFIG.CARD_ELEMENT_SELECTOR}'), планую клік!`, "info");

        // MODIFIED: Added random delay before click
        setTimeout(() => {
            if (!isScriptActive) { // Re-check
                log("[CardFeature] Script deactivated during delay, aborting card click.", "debug");
                return;
            }
            lastMajorActionTimestamp = Date.now(); // Update timestamp right before action

            try {
                log(`[CardFeature] Клікаю на карту після затримки. Елемент: ${cardElementNode.outerHTML.substring(0,100)}`, "info");
                cardElementNode.click();
                log(`[CardFeature] Елемент карти натиснуто. Очікуємо ${CONFIG.CARD_POPUP_CLOSE_DELAY_MS / 1000} сек перед закриттям попапу.`, "info");
                setTimeout(tryCloseCardPopup, CONFIG.CARD_POPUP_CLOSE_DELAY_MS); // This delay is for after the card is clicked
            } catch (e) {
                log(`[CardFeature] Помилка при кліку на елемент карти: ${e.message}`, "error");
            }
        }, getRandomDelay(CONFIG.CLICK_DELAY_MIN_MS, CONFIG.CLICK_DELAY_MAX_MS));
    }

    function setupCardFeatureObserver() { /* ... (no changes to core logic other than what was in v1.9.9 ) ... */
        if (!isScriptActive || cardFeatureObserver) {
            if (cardFeatureObserver && !isScriptActive) {
                 cardFeatureObserver.disconnect();
                 cardFeatureObserver = null;
                 log("[CardFeature] Спостерігач за картами зупинено через деактивацію скрипта.", "info");
            }
            return;
        }
        const targetNodeForCards = document.body;
        if (!targetNodeForCards) {
            log(`[CardFeature] Не знайдено цільовий вузол для спостерігача за картами (document.body).`, "error");
            return;
        }
        const observerOptions = { childList: true, subtree: true };
        const callback = function(mutationsList, observer) {
            if (!isScriptActive) return;
            for (const mutation of mutationsList) {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1) {
                            if (typeof node.matches === 'function' && node.matches(CONFIG.CARD_ELEMENT_SELECTOR)) {
                                handleCardElementAppearance(node);
                            } else if (typeof node.querySelectorAll === 'function') {
                                const cardElement = node.querySelector(CONFIG.CARD_ELEMENT_SELECTOR);
                                if (cardElement) {
                                    handleCardElementAppearance(cardElement);
                                }
                            }
                        }
                    });
                }
            }
        };
        try {
            cardFeatureObserver = new MutationObserver(callback);
            cardFeatureObserver.observe(targetNodeForCards, observerOptions);
            log(`[CardFeature] Спостерігач за появою карт запущено (ціль: body, селектор: '${CONFIG.CARD_ELEMENT_SELECTOR}').`, "info");
        } catch (e) {
            log(`ERROR defining or starting CardFeatureObserver: ${e.message}`, "error");
            cardFeatureObserver = null;
        }
    }

    // MODIFIED: Functions to schedule tasks with random intervals
    function scheduleNextMouseSim() {
        if (!isScriptActive) return; // Don't reschedule if script is off
        if (afkMouseSimTimeoutId) clearTimeout(afkMouseSimTimeoutId); // Clear any existing timeout

        const randomInterval = getRandomDelay(
            Math.max(5000, CONFIG.AFK_MOUSE_SIM_BASE_INTERVAL_MS - CONFIG.AFK_MOUSE_SIM_RANDOM_OFFSET_MS),
            CONFIG.AFK_MOUSE_SIM_BASE_INTERVAL_MS + CONFIG.AFK_MOUSE_SIM_RANDOM_OFFSET_MS
        );
        log(`[AntiAFK] Наступна симуляція миші через ${Math.round(randomInterval / 1000)} сек.`, "debug");

        afkMouseSimTimeoutId = setTimeout(() => {
            simulateMouseActivityInChat();
            scheduleNextMouseSim(); // Reschedule itself
        }, randomInterval);
    }

    function scheduleNextPopupClose() {
        if (!isScriptActive) return; // Don't reschedule if script is off
        if (popupCloseTimeoutId) clearTimeout(popupCloseTimeoutId); // Clear any existing timeout

        const randomInterval = getRandomDelay(
            Math.max(2000, CONFIG.POPUP_CLOSE_BASE_INTERVAL_MS - CONFIG.POPUP_CLOSE_RANDOM_OFFSET_MS),
            CONFIG.POPUP_CLOSE_BASE_INTERVAL_MS + CONFIG.POPUP_CLOSE_RANDOM_OFFSET_MS
        );
        log(`[Popups] Наступна перевірка спливаючих вікон через ${Math.round(randomInterval / 1000)} сек.`, "debug");

        popupCloseTimeoutId = setTimeout(() => {
            closePopups();
            scheduleNextPopupClose(); // Reschedule itself
        }, randomInterval);
    }


    function activateFeatures() {
        log("DEBUG: activateFeatures CALLED", "debug");
        const chatListElement = document.querySelector(CONFIG.CHAT_MESSAGE_LIST_SELECTOR);
        if (!chatListElement) {
            log("Функції, залежні від чату (CrystalObserver, InfoPanel), не активовано, оскільки чат не знайдено.", "warn");
        } else {
            log("Чат знайдено, активуємо функції, що від нього залежать (CrystalObserver, InfoPanel).", "info");
            createCrystalInfoPanel();
            scanExistingMessagesForCrystals(); // This will now use the delayed/cooldown logic in processSingleMessage
            setupCrystalObserver();
        }

        setupCardFeatureObserver(); // This will now use the delayed/cooldown logic in handleCardElementAppearance

        isScriptActive = true;
        localStorage.setItem(CONFIG.SCRIPT_STATE_KEY, JSON.stringify(isScriptActive));
        log('Скрипт АКТИВОВАНО.', "info");
        if (controlButton) controlButton.disabled = true; // Temporarily disable during activation

        // MODIFIED: Start self-scheduling timeouts instead of intervals
        scheduleNextMouseSim();
        scheduleNextPopupClose();

        if (controlButton) controlButton.disabled = false; // Re-enable button
        updateButtonAppearance();
        log("DEBUG: activateFeatures FINISHED", "debug");
    }

    function deactivateFeatures() {
        log("DEBUG: deactivateFeatures CALLED", "debug");
        isScriptActive = false; // Set this first to stop scheduled tasks from re-scheduling or executing fully
        localStorage.setItem(CONFIG.SCRIPT_STATE_KEY, JSON.stringify(isScriptActive));
        log('Скрипт ДЕАКТИВОВАНО.', "info");
        if (controlButton) controlButton.disabled = true;

        if (crystalObserver) {
            crystalObserver.disconnect();
            crystalObserver = null;
            log("👀 MutationObserver кристалів зупинено.", "info");
        }

        if (cardFeatureObserver) {
            cardFeatureObserver.disconnect();
            cardFeatureObserver = null;
            log("[CardFeature] Спостерігач за картами зупинено.", "info");
        }

        // MODIFIED: Clear timeouts
        if (afkMouseSimTimeoutId) {
            clearTimeout(afkMouseSimTimeoutId);
            afkMouseSimTimeoutId = null;
            log("[AntiAFK] Симуляцію миші зупинено.", "info");
        }
        if (popupCloseTimeoutId) {
            clearTimeout(popupCloseTimeoutId);
            popupCloseTimeoutId = null;
            log("[Popups] Закриття спливаючих вікон зупинено.", "info");
        }

        if (controlButtonPulseIntervalId) {
            clearInterval(controlButtonPulseIntervalId);
            controlButtonPulseIntervalId = null;
        }
        removeCrystalInfoPanel();

        if (controlButton) controlButton.disabled = false;
        updateButtonAppearance();
        log("DEBUG: deactivateFeatures FINISHED", "debug");
    }

    function initialSetup() {
        log("DEBUG: initialSetup called", "debug");
        loadState(); // isScriptActive will be set here
        log(`DEBUG: initialSetup - after loadState, isScriptActive: ${isScriptActive}`, "debug");
        createControlButton();
        log("DEBUG: initialSetup - after createControlButton", "debug");

        if (isScriptActive === true) { // Check the loaded state
            log("DEBUG: initialSetup - script is active, calling activateFeatures via setTimeout.", "debug");
            setTimeout(activateFeatures, 500); // Delay activation to let the page fully load
        } else {
            log('Скрипт стартує в НЕАКТИВНОМУ стані (isScriptActive: ' + isScriptActive + ').', "info");
            updateButtonAppearance(); // Ensure button shows "OFF" state
        }
        log("DEBUG: initialSetup finished", "debug");
    }

    try {
        log("DEBUG: Attempting to run initialSetup logic (try...catch block)", "debug");
        if (document.readyState === 'loading') {
            window.addEventListener('DOMContentLoaded', initialSetup);
        } else {
            initialSetup();
        }
        log("DEBUG: initialSetup logic in try...catch COMPLETED (or event listener added)", "debug");
    } catch(e) {
        console.error("[AutoCrystalScript] Критична помилка під час ініціалізації:", e);
    }
    log("SCRIPT EXECUTION FINISHED (IIFE end - v2.0.0)", "debug");
})();
// SCRIPT END //
