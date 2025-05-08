// ==UserScript==
// @name         Cards Info Rate Cache (Optimized v1.1.10 - Wanted Icon Only)
// @namespace    http://tampermonkey.net/
// @version      1.1.10
// @description  Оптимізована інфо про карти (Need/Trade), кешування, анімована кнопка вкл/викл. Бажані картки позначаються іконкою ⭐.
// @author       Kavernatiastasi (Assisted by AI)
// @match        https://asstars.tv/*
// @match        https://astars.club/*
// @match        https://animestars.org/*
// @match        https://as1.astars.club/*
// @match        https://asstars1.astars.club/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
    "use strict";

    const CONFIG = {
        CACHE_EXPIRY_DATA_MS: 3600 * 1000,
        CACHE_EXPIRY_WANT_LIST_MS: 180 * 1000, // 3 хвилини
        DEFAULT_BATCH_SIZE: 14,
        LOOTBOX_BATCH_SIZE: 3,
        DELAY_NORMAL_MS: 2000,
        DELAY_FAST_MS: 100,
        DELAY_CHUNK_MS: 100,
        BASE_URL_SELECTOR: 'link[rel="preconnect"]',
        USER_AVATAR_SELECTOR: '.lgn__ava img',
        CARD_ITEM_SELECTOR: '.anime-cards__item',
        SELECTORS_PAGES: {
            generalCards: '.anime-cards__item-wrapper',
            fullPageCards: '.anime-cards--full-page .anime-cards__item-wrapper',
            tradeItems: '.trade__main-items a',
            lootboxCards: '.lootbox__card',
            allAnimeCardsButton: 'a.glav-s[onclick*="AllAnimeCards"]',
            lootboxList: '.lootbox__list',
        },
        PAGINATION_BUTTON_SELECTOR: '.pagination__pages-btn a',
        PROFILE_FRIENDS_SELECTOR: '.profile__friends a',
        DARK_THEME_CLASS: 'dark-theme',
        INFO_CONTAINER_CLASS: 'card-stats-info-container',
        WANTED_BY_USER_CLASS: 'anime-cards__wanted-by-user', // Клас для бажаних карток (додає іконку)
        CACHE_PREFIX_DATA: 'cardData-',
        CACHE_KEY_WANT_LIST: 'currentUserWantList',
        CONTROL_BUTTON_ID: 'card-info-toggle-button',
        SCRIPT_ACTIVE_STATE_KEY: 'cardInfoScriptActiveState_v1_1_10', // Оновлено ключ
        DEBUG_LOGS: false // <<< ВИМКНЕНО ЗА ЗАМОВЧУВАННЯМ >>>
    };

    let baseUrl = "";
    let ongoingRequests = {};
    let isScriptActive;
    let themeObserver = null;
    let controlButton = null;
    let featureStyleElement = null;
    let allCardsButtonListener = null;
    let controlButtonPulseIntervalId = null;

    // Іконки для кнопки
    const eyeOnIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px;"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"></path></svg>`;
    const eyeOffIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px;"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.44-4.75C21.27 7.61 17 4.5 12 4.5c-1.6 0-3.14.39-4.54 1.08L9.17 7.36C9.74 7.13 10.35 7 11 7zm-1.07 7.93l2.83 2.83C12.74 18.87 12 19.5 12 19.5c-5 0-9.27-3.11-11-7.5 1.04-2.58 3.03-4.69 5.44-6.06L9.93 9.07zM2.71 3.29a1 1 0 00-1.42 1.42l1.63 1.63C1.31 7.97.16 10.13 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l1.62 1.62a1 1 0 001.42-1.42L2.71 3.29zM12 17c-2.76 0-5-2.24-5-5 0-.77.18-1.49.5-2.14l1.57 1.57c-.01.19-.07.38-.07.57 0 1.66 1.34 3 3 3 .19 0 .38-.06.57-.07L14.14 16.5c-.65.32-1.37.5-2.14.5z"></path></svg>`;

    // Ініціалізація стану
    const savedActiveState = localStorage.getItem(CONFIG.SCRIPT_ACTIVE_STATE_KEY);
    if (savedActiveState !== null) {
        isScriptActive = JSON.parse(savedActiveState);
    } else {
        isScriptActive = true;
    }

    // --- Утиліти ---
    function logError(...args) { console.error('[Cards Info Script]', ...args); }
    function logInfo(...args) { if (CONFIG.DEBUG_LOGS) console.log('[Cards Info Script]', ...args); } // Залежить від DEBUG_LOGS
    function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
     function saveToCache(key, data, expiryMs) {
         try {
            const item = { timestamp: Date.now(), data: data };
            localStorage.setItem(key, JSON.stringify(item));
            if (expiryMs) { setTimeout(() => { localStorage.removeItem(key); }, expiryMs); }
        } catch (error) { logError('Error saving to cache:', key, error); }
     }
    function getFromCache(key, maxAgeMs) {
        try {
            const itemString = localStorage.getItem(key);
            if (!itemString) return null;
            const item = JSON.parse(itemString);
            if (Date.now() - item.timestamp > maxAgeMs) {
                localStorage.removeItem(key);
                return null;
            }
            return item.data;
        } catch (error) {
            logError('Error getting from cache:', key, error);
            localStorage.removeItem(key);
            return null;
        }
    }
    function initializeBaseUrl() {
        try {
            const preconnectLink = document.querySelector(CONFIG.BASE_URL_SELECTOR);
            if (preconnectLink) {
                baseUrl = preconnectLink.getAttribute('href') || '';
                if (baseUrl && !baseUrl.endsWith('/')) { baseUrl += '/'; }
            }
            // Не логуємо помилку, якщо URL не знайдено, бо це може бути не на всіх сторінках
            // if (!baseUrl) { logError('Base URL could not be determined.'); }
        } catch (error) { logError('Error initializing base URL:', error); }
     }
    function createCardInfoElements() {
        const infoContainer = document.createElement('div');
        infoContainer.className = CONFIG.INFO_CONTAINER_CLASS;
        Object.assign(infoContainer.style, {
            textAlign: 'center', marginTop: '2px', cursor: 'pointer',
            marginRight: '0px', marginLeft: '0px', height: '20px',
            flex: '1', padding: '5px', paddingBottom: '7.25px',
            borderRadius: '7px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between',
        });
        const needContainer = document.createElement('div');
        Object.assign(needContainer.style, { flex: '1', display: 'flex', alignItems: 'center', justifyContent: 'center' });
        const tradeContainer = document.createElement('div');
        Object.assign(tradeContainer.style, { flex: '1', display: 'flex', alignItems: 'center', justifyContent: 'center' });
        infoContainer.appendChild(needContainer);
        infoContainer.appendChild(tradeContainer);
        return { infoContainer, needContainer, tradeContainer };
    }
    function getRatingColor(needCount, tradeCount) {
        if (needCount === 0 && tradeCount === 0) return '#e0e0e0';
        if (tradeCount === 0 && needCount > 0) return '#1DD300';
        if (needCount === 0 && tradeCount > 0) return '#A60000';
        const ratio = needCount / tradeCount;
        if (ratio >= 2) return '#1DD300';
        if (ratio >= 1.25) return '#7AE969';
        if (ratio >= 0.75) return '#FFFF00';
        if (ratio >= 0.5) return '#FF8C00';
        return '#FF4040';
     }
    function isDarkThemeActive() { return document.body.classList.contains(CONFIG.DARK_THEME_CLASS); }
    function getTextForegroundColor() { return isDarkThemeActive() ? '#ffffff' : '#000000'; }
    function updateTextColorForThemeChange() {
        if (!isScriptActive) return;
        const newColor = getTextForegroundColor();
        document.querySelectorAll(`.${CONFIG.INFO_CONTAINER_CLASS} div`).forEach(div => {
            div.style.color = newColor;
        });
     }
    function setupThemeObserver() {
         if (themeObserver) { themeObserver.disconnect(); }
        themeObserver = new MutationObserver(mutationsList => {
            if (!isScriptActive) return;
            for (const mutation of mutationsList) {
                if (mutation.attributeName === 'class' && mutation.target === document.body) {
                    updateTextColorForThemeChange();
                    break;
                }
            }
        });
        themeObserver.observe(document.body, { attributes: true });
     }

    // --- Завантаження даних ---
    async function fetchHttp(url) {
         if (!isScriptActive) return Promise.reject(new Error("Script is deactivated. Request cancelled."));
        if (ongoingRequests[url]) { return ongoingRequests[url]; }
        ongoingRequests[url] = new Promise((resolve, reject) => {
            if (!isScriptActive) {
                delete ongoingRequests[url];
                return reject(new Error("Script is deactivated. Request cancelled before sending."));
            }
            GM_xmlhttpRequest({
                method: 'GET', url: url,
                onload: function (response) {
                    delete ongoingRequests[url];
                    if (!isScriptActive && response.status >= 200 && response.status < 300) {
                        return reject(new Error(`Script deactivated during fetch for ${url}`));
                    }
                    if (response.status >= 200 && response.status < 300) {
                        resolve(response.responseText);
                    } else {
                        reject(new Error(`HTTP error ${response.status} for ${url}. Response: ${response.statusText}`));
                    }
                },
                onerror: function (error) { delete ongoingRequests[url]; logError('GM_xmlhttpRequest error for:', url, error); reject(error); },
                ontimeout: function () { delete ongoingRequests[url]; logError('GM_xmlhttpRequest timeout for:', url); reject(new Error(`Timeout for ${url}`)); }
            });
        });
        return ongoingRequests[url];
     }
    async function fetchUserCount(dataUrl) {
         if (!isScriptActive) return 0;
        const cacheKey = CONFIG.CACHE_PREFIX_DATA + dataUrl.replace(/[^a-zA-Z0-9]/g, '_');
        const cachedData = getFromCache(cacheKey, CONFIG.CACHE_EXPIRY_DATA_MS);
        if (cachedData !== null) { return cachedData; }
        let totalCount = 0;
        let currentPageUrl = dataUrl;
        try {
            while (currentPageUrl && isScriptActive) {
                const htmlText = await fetchHttp(currentPageUrl);
                if (!isScriptActive) return totalCount;
                const parser = new DOMParser();
                const doc = parser.parseFromString(htmlText, 'text/html');
                totalCount += doc.querySelectorAll(CONFIG.PROFILE_FRIENDS_SELECTOR).length;
                const paginationButton = doc.querySelector(`${CONFIG.PAGINATION_BUTTON_SELECTOR}[href]:not([href="${currentPageUrl}"]):not([href="#"]):not([href^="javascript:void"])`);
                let nextHref = paginationButton ? paginationButton.getAttribute('href') : null;
                if (nextHref) {
                    currentPageUrl = nextHref.startsWith('http') ? nextHref : (baseUrl ? `${baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl}/${nextHref.startsWith('/') ? nextHref.slice(1) : nextHref}` : null);
                    // Не логуємо помилку, просто пагінація зупиниться, якщо baseUrl не визначено
                    // if (!currentPageUrl && baseUrl) logError("Cannot construct pagination URL: global baseUrl is not set. Stopping pagination.");
                } else { currentPageUrl = null; }
            }
            if (isScriptActive) { saveToCache(cacheKey, totalCount, CONFIG.CACHE_EXPIRY_DATA_MS); }
            return totalCount;
        } catch (error) {
            if (!error.message.includes("Script is deactivated") && !error.message.includes("Script deactivated during fetch")) { logError('Failed to fetch user count for:', dataUrl, error); }
            return totalCount;
        }
    }
    async function fetchUserWantList(userProfileBaseUrl) {
        if (!isScriptActive) return [];
        const cachedWantList = getFromCache(CONFIG.CACHE_KEY_WANT_LIST, CONFIG.CACHE_EXPIRY_WANT_LIST_MS);
        if (cachedWantList) { return cachedWantList; }
        logInfo('Fetching user want list...');
        let wantList = [];
        let currentPageUrl = userProfileBaseUrl.endsWith('/') ? `${userProfileBaseUrl}cards/need/page/1/` : `${userProfileBaseUrl}/cards/need/page/1/`;
        try {
            while (currentPageUrl && isScriptActive) {
                const htmlText = await fetchHttp(currentPageUrl);
                if (!isScriptActive) return wantList;
                const parser = new DOMParser();
                const doc = parser.parseFromString(htmlText, 'text/html');
                doc.querySelectorAll(CONFIG.CARD_ITEM_SELECTOR).forEach(cardElement => {
                    const cardId = cardElement.getAttribute('data-id');
                    if (cardId) wantList.push(cardId);
                });
                const paginationButton = doc.querySelector(`${CONFIG.PAGINATION_BUTTON_SELECTOR}[href]:not([href="${currentPageUrl}"]):not([href="#"]):not([href^="javascript:void"])`);
                let nextHref = paginationButton ? paginationButton.getAttribute('href') : null;
                if (nextHref) {
                    currentPageUrl = nextHref.startsWith('http') ? nextHref : (baseUrl ? `${baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl}/${nextHref.startsWith('/') ? nextHref.slice(1) : nextHref}` : null);
                     // if (!currentPageUrl && baseUrl) logError("Cannot construct pagination URL for want list: global baseUrl is not set.");
                } else { currentPageUrl = null; }
            }
            if (isScriptActive) {
                saveToCache(CONFIG.CACHE_KEY_WANT_LIST, wantList, CONFIG.CACHE_EXPIRY_WANT_LIST_MS);
                logInfo('Want list fetched and cached:', wantList.length, 'cards.');
            }
            return wantList;
        } catch (error) {
            if (!error.message.includes("Script is deactivated") && !error.message.includes("Script deactivated during fetch")) { logError('Failed to fetch user want list from:', userProfileBaseUrl, error); }
            return wantList;
        }
     }

    // --- Відображення статистики ---
    async function displayCardStatistics(cardElementWrapper, cardId) {
        if (!isScriptActive || !baseUrl || !cardId || cardElementWrapper.querySelector(`.${CONFIG.INFO_CONTAINER_CLASS}`)) { return; }
        const needUrl = `${baseUrl}cards/${cardId}/users/need/`;
        const tradeUrl = `${baseUrl}cards/${cardId}/users/trade/`;
        try {
            const [needCount, tradeCount] = await Promise.all([fetchUserCount(needUrl), fetchUserCount(tradeUrl)]);
            if (!isScriptActive) return;

            const { infoContainer, needContainer, tradeContainer } = createCardInfoElements();
            infoContainer.style.backgroundColor = getRatingColor(needCount, tradeCount);
            const textColor = getTextForegroundColor();
            needContainer.style.color = textColor;
            tradeContainer.style.color = textColor;
            needContainer.textContent = `Need: ${needCount}`;
            tradeContainer.textContent = `Trade: ${tradeCount}`;
            cardElementWrapper.appendChild(infoContainer);

            // Тільки логіка для бажаних карток
            const wantList = getFromCache(CONFIG.CACHE_KEY_WANT_LIST, CONFIG.CACHE_EXPIRY_WANT_LIST_MS);
            if (wantList && wantList.includes(cardId)) {
                cardElementWrapper.classList.add(CONFIG.WANTED_BY_USER_CLASS); // Цей клас тепер додає іконку ⭐
            }
        } catch (error) {
             if (!error.message.includes("Script is deactivated") && !error.message.includes("Script deactivated during fetch")) { logError('Error displaying card stats for cardId:', cardId, error); }
        }
    }

    // --- Обробка елементів ---
    async function processCardElements(selector, batchSize, processingDelayMs, isTradeItem = false) {
        if (!isScriptActive) return;
        const cardElements = document.querySelectorAll(selector);
        if (cardElements.length === 0) return;
        const promises = [];
        for (let i = 0; i < cardElements.length; i += batchSize) {
            if (!isScriptActive) break;
            const batch = Array.from(cardElements).slice(i, i + batchSize);
            for (const element of batch) {
                if (!isScriptActive) break;
                try {
                    let cardId, wrapperElement = element;
                    if (isTradeItem) {
                        const href = element.getAttribute('href');
                        if (href) { const parts = href.split('/'), cardsIndex = parts.indexOf('cards'); if (cardsIndex !== -1 && parts.length > cardsIndex + 1) cardId = parts[cardsIndex + 1]; }
                    } else {
                        const cardItem = element.matches(CONFIG.CARD_ITEM_SELECTOR) ? element : element.querySelector(CONFIG.CARD_ITEM_SELECTOR);
                        cardId = cardItem ? cardItem.getAttribute('data-id') : element.getAttribute('data-id');
                        if (!cardId && element.classList.contains('lootbox__card')) cardId = element.getAttribute('data-id');
                    }
                    if (cardId) { promises.push(displayCardStatistics(wrapperElement, cardId)); }
                } catch (e) { logError('Error processing individual card element:', element, e); }
            }
            if (!isScriptActive) break;
            if (i + batchSize < cardElements.length) {
                let accumulatedDelay = 0;
                while (accumulatedDelay < processingDelayMs && isScriptActive) {
                    const currentChunk = Math.min(CONFIG.DELAY_CHUNK_MS, processingDelayMs - accumulatedDelay);
                    await delay(currentChunk);
                    accumulatedDelay += CONFIG.DELAY_CHUNK_MS;
                }
                if (!isScriptActive) break;
            }
        }
        try { await Promise.all(promises); } catch(e) {/* Ignore deactivation errors */}
    }

    // --- Слухач кнопки Всіх Карток ---
    function _allCardsClickListener() {
        if (!isScriptActive) return;
        logInfo('Clicked "All Anime Cards". Refreshing full page cards info...');
        setTimeout(async () => {
            if (!isScriptActive) return;
            await processCardElements(CONFIG.SELECTORS_PAGES.fullPageCards, CONFIG.DEFAULT_BATCH_SIZE, CONFIG.DELAY_FAST_MS);
        }, 300);
     }
    function setupAllCardsButtonListener(doSetup) {
        const allCardsButton = document.querySelector(CONFIG.SELECTORS_PAGES.allAnimeCardsButton);
        if (allCardsButton) {
            if (allCardsButtonListener) {
                allCardsButton.removeEventListener('click', allCardsButtonListener);
                allCardsButtonListener = null;
            }
            if (doSetup && isScriptActive) {
                allCardsButtonListener = _allCardsClickListener;
                allCardsButton.addEventListener('click', allCardsButtonListener);
            }
        }
     }

    // --- Керування стилями ---
    function manageFeatureStyles(add) {
        if (add && isScriptActive) {
            if (!featureStyleElement) {
                featureStyleElement = document.createElement('style');
                featureStyleElement.id = 'card-info-feature-styles';
                // Залишився тільки стиль для WANTED_BY_USER_CLASS (іконка)
                featureStyleElement.textContent = `
                    .${CONFIG.WANTED_BY_USER_CLASS} {
                        position: relative !important;
                    }
                    .${CONFIG.WANTED_BY_USER_CLASS}::after {
                        content: '⭐';
                        position: absolute;
                        top: 5px;
                        left: 5px;
                        z-index: 5;
                        font-size: 16px;
                        line-height: 1;
                        background-color: rgba(0, 0, 0, 0.6);
                        border-radius: 3px;
                        padding: 1px 3px;
                    }
                `;
            }
            if (featureStyleElement && !document.head.contains(featureStyleElement)) {
                document.head.appendChild(featureStyleElement);
            }
        } else {
            if (featureStyleElement && document.head.contains(featureStyleElement)) {
                document.head.removeChild(featureStyleElement);
            }
        }
    }

    // --- Видалення UI ---
    function removeAddedUIElements() {
        document.querySelectorAll(`.${CONFIG.INFO_CONTAINER_CLASS}`).forEach(el => el.remove());
        document.querySelectorAll(`.${CONFIG.WANTED_BY_USER_CLASS}`).forEach(el => {
            el.classList.remove(CONFIG.WANTED_BY_USER_CLASS);
        });
     }

    // --- Запуск основного функціоналу ---
    async function runActiveFeatures() {
        if (!isScriptActive) return;
        // logInfo('Running active features...'); // Зменшуємо кількість логів
        initializeBaseUrl();
        await delay(50);
        if (!baseUrl) { logError('Script cannot run effectively without a base URL.'); }
        setupThemeObserver();
        manageFeatureStyles(true);
        updateButtonAppearance(); // Оновлення кнопки на початку
        const userAvatar = document.querySelector(CONFIG.USER_AVATAR_SELECTOR);
        const userName = userAvatar ? userAvatar.getAttribute('title') : null;
        if (userName && baseUrl && isScriptActive) {
            const userProfileUrl = `${baseUrl}user/${userName}/`;
            await fetchUserWantList(userProfileUrl); // Завантажуємо список бажаного
        }
        if (!isScriptActive) return;
        const pageChecks = [
            { selector: CONFIG.SELECTORS_PAGES.generalCards, batch: CONFIG.DEFAULT_BATCH_SIZE, delay: CONFIG.DELAY_NORMAL_MS, trade: false },
            { selector: CONFIG.SELECTORS_PAGES.fullPageCards, batch: CONFIG.DEFAULT_BATCH_SIZE, delay: CONFIG.DELAY_FAST_MS, trade: false },
            { selector: CONFIG.SELECTORS_PAGES.tradeItems, batch: CONFIG.DEFAULT_BATCH_SIZE, delay: CONFIG.DELAY_FAST_MS, trade: true },
            { selector: CONFIG.SELECTORS_PAGES.lootboxCards, batch: CONFIG.LOOTBOX_BATCH_SIZE, delay: CONFIG.DELAY_FAST_MS, trade: false }
        ];
        for (const check of pageChecks) {
            if (!isScriptActive) break;
            // Перевіряємо, чи відповідний селектор існує *перед* запуском обробки
            const containerElement = document.querySelector(check.selector);
            if (containerElement) {
                 // Передаємо сам контейнер, щоб не шукати його знову (мікро-оптимізація)
                 // Або просто перевіряємо як раніше: if(document.querySelector(check.selector))
                 await processCardElements(check.selector, check.batch, check.delay, check.trade);
            }
        }
        if (isScriptActive) {
            setupAllCardsButtonListener(true);
            updateTextColorForThemeChange();
        }
     }

    // --- Керування станом ---
    function activateScriptFeatures() {
        isScriptActive = true;
        localStorage.setItem(CONFIG.SCRIPT_ACTIVE_STATE_KEY, JSON.stringify(isScriptActive));
        // logInfo('Script Activated.'); // Менше логів
        if (controlButton) controlButton.disabled = true;
        runActiveFeatures().finally(() => {
            if (controlButton) controlButton.disabled = false;
            updateButtonAppearance();
        });
    }
    function deactivateScriptFeatures() {
        isScriptActive = false;
        localStorage.setItem(CONFIG.SCRIPT_ACTIVE_STATE_KEY, JSON.stringify(isScriptActive));
        // logInfo('Script Deactivated.'); // Менше логів
        if (controlButton) controlButton.disabled = true;
        ongoingRequests = {};
        removeAddedUIElements();
        manageFeatureStyles(false);
        if (themeObserver) { themeObserver.disconnect(); }
        setupAllCardsButtonListener(false);
        if (controlButtonPulseIntervalId) {
            clearInterval(controlButtonPulseIntervalId);
            controlButtonPulseIntervalId = null;
        }
        // Негайно оновлюємо кнопку і розблоковуємо
        if (controlButton) controlButton.disabled = false;
        updateButtonAppearance();
     }

    // --- Кнопка керування ---
    function updateButtonAppearance() {
        if (!controlButton) return;
        if (controlButtonPulseIntervalId) {
            clearInterval(controlButtonPulseIntervalId);
            controlButtonPulseIntervalId = null;
        }
        controlButton.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
        if (isScriptActive) {
            controlButton.innerHTML = `${eyeOnIconSVG} Info: ON`;
            controlButton.style.background = 'linear-gradient(135deg, #28a745 0%, #218838 100%)';
            let pulseOut = true;
            controlButtonPulseIntervalId = setInterval(() => {
                if (!isScriptActive || !controlButton) {
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
            controlButton.innerHTML = `${eyeOffIconSVG} Info: OFF`;
            controlButton.style.background = 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)';
        }
     }
    function createControlButton() {
        let existingButton = document.getElementById(CONFIG.CONTROL_BUTTON_ID);
        if (existingButton) {
            controlButton = existingButton;
        } else {
            controlButton = document.createElement('button');
            controlButton.id = CONFIG.CONTROL_BUTTON_ID;
            Object.assign(controlButton.style, {
                position: 'fixed', top: '65px', right: '15px', zIndex: '10001',
                padding: '10px 18px', fontSize: '15px', color: 'white',
                fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                fontWeight: '500', border: 'none', borderRadius: '50px',
                cursor: 'pointer', boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
                transition: 'background 0.3s ease, transform 0.15s ease, box-shadow 0.3s ease',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                minWidth: '150px'
            });
            try { // Додамо try-catch навколо appendChild
                document.body.appendChild(controlButton);
            } catch(e) {
                logError("Не вдалося додати кнопку керування на сторінку:", e);
                return; // Зупиняємо створення кнопки, якщо appendChild не вдався
            }
        }
        updateButtonAppearance();

        if (!controlButton.dataset.listenerAttached) {
            controlButton.addEventListener('click', () => {
                // Видалено діагностичні console.log
                if (controlButton.disabled) return;
                controlButton.disabled = true;
                if (isScriptActive) {
                    deactivateScriptFeatures();
                } else {
                    activateScriptFeatures();
                }
            });
            controlButton.addEventListener('mouseenter', () => { if (!controlButton.disabled) { controlButton.style.transform = 'translateY(-2px)'; controlButton.style.boxShadow = isScriptActive ? '0 8px 18px rgba(33, 136, 56, 0.6)' : '0 8px 18px rgba(200, 35, 51, 0.6)'; } });
            controlButton.addEventListener('mouseleave', () => { if (!controlButton.disabled) { controlButton.style.transform = 'translateY(0)'; if (!isScriptActive || !controlButtonPulseIntervalId) { controlButton.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)'; } } });
            controlButton.addEventListener('mousedown', () => { if (!controlButton.disabled) controlButton.style.transform = 'translateY(0px) scale(0.97)'; });
            controlButton.addEventListener('mouseup', () => { if (!controlButton.disabled) controlButton.style.transform = controlButton.matches(':hover') ? 'translateY(-2px)' : 'translateY(0)'; });
            controlButton.dataset.listenerAttached = 'true';
        }
     }

    // --- Ініціалізація ---
    function initialSetup() {
         createControlButton();
        if (isScriptActive) {
            activateScriptFeatures();
        } else {
            // logInfo('Script starts in DEACTIVATED state as per saved preference.'); // Менше логів
            updateButtonAppearance();
        }
    }
    // Запуск після завантаження DOM для надійності
     if (document.readyState === 'loading') {
         window.addEventListener('DOMContentLoaded', initialSetup);
     } else {
         initialSetup();
     }

})(); // Кінець скрипта