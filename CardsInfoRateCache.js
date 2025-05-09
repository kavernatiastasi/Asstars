// ==UserScript==
// @name         Cards Info Rate Cache (Optimized v1.1.10 - BUTTON DEBUG FIX 2)
// @namespace    http://tampermonkey.net/
// @version      1.1.10-debug-fix2
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
        CACHE_EXPIRY_WANT_LIST_MS: 180 * 1000,
        DEFAULT_BATCH_SIZE: 14,
        LOOTBOX_BATCH_SIZE: 3,
        DELAY_NORMAL_MS: 2000,
        DELAY_FAST_MS: 100,
        DELAY_CHUNK_MS: 100,
        BASE_URL_SELECTOR: 'link[rel="preconnect"]',
        USER_AVATAR_SELECTOR: '.lgn__ava img',
        CARD_ITEM_SELECTOR: '.anime-cards__item',
        SELECTORS_PAGES: { /* ... */
            generalCards: '.anime-cards__item-wrapper',
            fullPageCards: '.anime-cards--full-page .anime-cards__item-wrapper',
            tradeItems: '.trade__main-items a',
            lootboxCards: '.lootbox__card',
            allAnimeCardsButton: 'a.glav-s[onclick*="AllAnimeCards"]',
            lootboxList: '.lootbox__list',
        },
        PAGINATION_SELECTOR: '.pagination__pages',
        PAGINATION_BUTTON_SELECTOR: '.pagination__pages-btn a',
        PROFILE_FRIENDS_SELECTOR: '.profile__friends-item',
        DARK_THEME_CLASS: 'dark-theme',
        INFO_CONTAINER_CLASS: 'card-stats-info-container',
        WANTED_BY_USER_CLASS: 'anime-cards__wanted-by-user',
        CACHE_PREFIX_DATA: 'cardData_v12-',
        CACHE_PREFIX_DIRECT_STATS: 'cardDirectStats_v12-',
        CACHE_KEY_WANT_LIST: 'currentUserWantList_v12',
        CONTROL_BUTTON_ID: 'card-info-toggle-button',
        SCRIPT_ACTIVE_STATE_KEY: 'cardInfoScriptActiveState_v1_1_10',
        DIRECT_STATS_PAGE_URL_TEMPLATE: "/cards/{cardId}/users/",
        DIRECT_NEED_COUNT_SELECTOR: "#owners-need",
        DIRECT_TRADE_COUNT_SELECTOR: "#owners-trade",
        ITEMS_PER_USER_LIST_PAGE: 50,
        DEBUG_LOGS: false // <<< УВІМКНЕНО ДЛЯ ДІАГНОСТИКИ >>>
    };

    let baseUrl = "";
    let ongoingRequests = {};
    let isScriptActive; // Буде ініціалізовано в loadState
    let themeObserver = null;
    let controlButton = null;
    let featureStyleElement = null;
    let allCardsButtonListener = null;
    let controlButtonPulseIntervalId = null;

    const eyeOnIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px;"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"></path></svg>`;
    const eyeOffIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px;"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.44-4.75C21.27 7.61 17 4.5 12 4.5c-1.6 0-3.14.39-4.54 1.08L9.17 7.36C9.74 7.13 10.35 7 11 7zm-1.07 7.93l2.83 2.83C12.74 18.87 12 19.5 12 19.5c-5 0-9.27-3.11-11-7.5 1.04-2.58 3.03-4.69 5.44-6.06L9.93 9.07zM2.71 3.29a1 1 0 00-1.42 1.42l1.63 1.63C1.31 7.97.16 10.13 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l1.62 1.62a1 1 0 001.42-1.42L2.71 3.29zM12 17c-2.76 0-5-2.24-5-5 0-.77.18-1.49.5-2.14l1.57 1.57c-.01.19-.07.38-.07.57 0 1.66 1.34 3 3 3 .19 0 .38-.06.57-.07L14.14 16.5c-.65.32-1.37.5-2.14.5z"></path></svg>`;

    // --- Утиліти ---
    function logError(...args) { console.error('[Cards Info Script DEBUG]', ...args); }
    function logInfo(...args) { if (CONFIG.DEBUG_LOGS) console.log('[Cards Info Script DEBUG]', ...args); }
    function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    // --- Функція завантаження стану ---
    function loadState() {
        logInfo('[LOAD_STATE] Loading script active state...');
        const savedState = localStorage.getItem(CONFIG.SCRIPT_ACTIVE_STATE_KEY);
        if (savedState !== null) {
            isScriptActive = JSON.parse(savedState);
            logInfo('[LOAD_STATE] Loaded state from localStorage:', isScriptActive);
        } else {
            isScriptActive = true; // Активний за замовчуванням, якщо немає збереженого стану
            logInfo('[LOAD_STATE] No saved state found, defaulting to true.');
        }
    }
    // --- Кінець функції завантаження стану ---

    function saveToCache(key, data, expiryMs) { /* ... */
        try {
            const item = { timestamp: Date.now(), data: data };
            localStorage.setItem(key, JSON.stringify(item));
        } catch (error) { logError('Error saving to cache:', key, error); }
    }
    function getFromCache(key, maxAgeMs) { /* ... */
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
    function initializeBaseUrl() { /* ... (версія з v1.1.12) ... */
        try {
            const preconnectLink = document.querySelector(CONFIG.BASE_URL_SELECTOR);
            if (preconnectLink && preconnectLink.href) {
                baseUrl = preconnectLink.href;
                if (!baseUrl.startsWith('http')) {
                    baseUrl = new URL(baseUrl, window.location.origin).href;
                }
            } else {
                baseUrl = window.location.origin + '/';
                logInfo(`Base URL from <link rel="preconnect"> not found or invalid. Using current origin: ${baseUrl}`);
            }
            if (baseUrl && !baseUrl.endsWith('/')) {
                baseUrl += '/';
            }
            logInfo('Base URL determined:', baseUrl);
        } catch (error) {
            logError('Error initializing base URL:', error);
            baseUrl = window.location.origin + '/';
            logInfo('Fallback Base URL due to error:', baseUrl);
        }
         if (!baseUrl) {
            logError('Base URL is still empty after initialization attempts!');
        }
    }
    function createCardInfoElements() { /* ... */
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
    function getRatingColor(needCount, tradeCount) { /* ... */
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
    function updateTextColorForThemeChange() { /* ... */
        if (!isScriptActive) return;
        const newColor = getTextForegroundColor();
        document.querySelectorAll(`.${CONFIG.INFO_CONTAINER_CLASS} div`).forEach(div => {
            div.style.color = newColor;
        });
    }
    function setupThemeObserver() { /* ... */
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
    async function fetchHttp(url) { /* ... (з логуванням абсолютного URL, як у v1.1.12) ... */
        if (!isScriptActive) return Promise.reject(new Error("Script is deactivated. Request cancelled."));
        let absoluteUrl = url;
        if (!url.startsWith('http') && baseUrl) {
            try {
                absoluteUrl = new URL(url, baseUrl).href;
            } catch (e) {
                logError(`Invalid URL construction: path="${url}", base="${baseUrl}"`, e);
                return Promise.reject(new Error(`Invalid URL: ${url}`));
            }
        } else if (!url.startsWith('http') && !baseUrl) {
             logError(`Cannot make relative request, baseUrl is not set. URL: ${url}`);
             return Promise.reject(new Error(`Cannot make relative request, baseUrl is not set. URL: ${url}`));
        }
        if (ongoingRequests[absoluteUrl]) { return ongoingRequests[absoluteUrl]; }
        ongoingRequests[absoluteUrl] = new Promise((resolve, reject) => {
            if (!isScriptActive) {
                delete ongoingRequests[absoluteUrl];
                return reject(new Error("Script is deactivated. Request cancelled before sending."));
            }
            logInfo(`Workspaceing: ${absoluteUrl}`);
            GM_xmlhttpRequest({
                method: 'GET', url: absoluteUrl,
                onload: function (response) {
                    delete ongoingRequests[absoluteUrl];
                    if (!isScriptActive && response.status >= 200 && response.status < 300) {
                        return reject(new Error(`Script deactivated during fetch for ${absoluteUrl}`));
                    }
                    if (response.status >= 200 && response.status < 300) {
                        resolve(response.responseText);
                    } else {
                        reject(new Error(`HTTP error ${response.status} for ${absoluteUrl}. Response: ${response.statusText}`));
                    }
                },
                onerror: function (error) { delete ongoingRequests[absoluteUrl]; logError('GM_xmlhttpRequest error for:', absoluteUrl, error); reject(error); },
                ontimeout: function () { delete ongoingRequests[absoluteUrl]; logError('GM_xmlhttpRequest timeout for:', absoluteUrl); reject(new Error(`Timeout for ${absoluteUrl}`)); }
            });
        });
        return ongoingRequests[absoluteUrl];
    }
    async function fetchCardStatsDirectly(cardId) { /* ... (з v1.1.12) ... */
        if (!isScriptActive || !baseUrl) return null;
        const relativePath = CONFIG.DIRECT_STATS_PAGE_URL_TEMPLATE.replace('{cardId}', cardId);
        const statsPageUrlForFetch = relativePath;
        const cacheKey = CONFIG.CACHE_PREFIX_DIRECT_STATS + cardId;
        const cachedData = getFromCache(cacheKey, CONFIG.CACHE_EXPIRY_DATA_MS);
        if (cachedData) {
            logInfo(`Cache HIT for direct stats (cardId: ${cardId})`, cachedData);
            return cachedData;
        }
        logInfo(`Workspaceing direct stats for cardId: ${cardId} (path: ${statsPageUrlForFetch})`);
        try {
            const htmlText = await fetchHttp(statsPageUrlForFetch);
            if (!isScriptActive) return null;
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlText, 'text/html');
            const needElement = doc.querySelector(CONFIG.DIRECT_NEED_COUNT_SELECTOR);
            const tradeElement = doc.querySelector(CONFIG.DIRECT_TRADE_COUNT_SELECTOR);
            if (needElement && tradeElement) {
                const needCount = parseInt(needElement.textContent.trim(), 10) || 0;
                const tradeCount = parseInt(tradeElement.textContent.trim(), 10) || 0;
                const stats = { needCount, tradeCount };
                if (isScriptActive) saveToCache(cacheKey, stats, CONFIG.CACHE_EXPIRY_DATA_MS);
                logInfo(`Workspaceed direct stats for cardId ${cardId}:`, stats);
                return stats;
            } else {
                logInfo(`Direct stat elements not found for cardId: ${cardId} on page from path ${statsPageUrlForFetch}. Need: ${!!needElement}, Trade: ${!!tradeElement}`);
                return null;
            }
        } catch (error) {
            if (!error.message.includes("Script is deactivated") && !error.message.includes("Script deactivated during fetch")) {
                logError(`Failed to fetch direct stats for cardId: ${cardId} from path ${statsPageUrlForFetch}`, error);
            }
            return null;
        }
    }
    async function fetchUserCount(fullDataUrl, type) { /* ... (з v1.1.12) ... */
        if (!isScriptActive) return 0;
        const cacheKey = CONFIG.CACHE_PREFIX_DATA + fullDataUrl.replace(/[^a-zA-Z0-9]/g, '_');
        const cachedCount = getFromCache(cacheKey, CONFIG.CACHE_EXPIRY_DATA_MS);
        if (cachedCount !== null) {
            logInfo(`Cache HIT for ${type} count (url: ${fullDataUrl}): ${cachedCount}`);
            return cachedCount;
        }
        logInfo(`Workspaceing paginated ${type} count for URL: ${fullDataUrl}`);
        let totalCount = 0;
        try {
            const firstPageHtml = await fetchHttp(fullDataUrl);
            if (!isScriptActive) return 0;
            const parser = new DOMParser();
            const firstPageDoc = parser.parseFromString(firstPageHtml, 'text/html');
            const usersOnFirstPage = firstPageDoc.querySelectorAll(CONFIG.PROFILE_FRIENDS_SELECTOR).length;
            totalCount += usersOnFirstPage;
            const paginationContainer = firstPageDoc.querySelector(CONFIG.PAGINATION_SELECTOR);
            if (paginationContainer && usersOnFirstPage >= CONFIG.ITEMS_PER_USER_LIST_PAGE) {
                const pageLinks = Array.from(paginationContainer.querySelectorAll('a[href]'));
                let lastPageNum = 1;
                 pageLinks.forEach(link => {
                    const pageNumMatch = link.textContent.match(/\d+/);
                    if (pageNumMatch) {
                        const pageNum = parseInt(pageNumMatch[0], 10);
                        if (pageNum > lastPageNum) lastPageNum = pageNum;
                    } else {
                        const hrefPageMatch = link.href.match(/\/page\/(\d+)\/?$/);
                        if (hrefPageMatch) {
                            const pageNum = parseInt(hrefPageMatch[1], 10);
                            if (pageNum > lastPageNum) lastPageNum = pageNum;
                        }
                    }
                });
                if (lastPageNum > 1) {
                    logInfo(`Pagination detected for ${fullDataUrl}. Total pages approx: ${lastPageNum}. Users on first page: ${usersOnFirstPage}`);
                    totalCount = (lastPageNum - 1) * CONFIG.ITEMS_PER_USER_LIST_PAGE;
                    let lastPagePath;
                    if (fullDataUrl.includes('/page/')) {
                        lastPagePath = fullDataUrl.replace(/\/page\/\d+\/?$/, `/page/${lastPageNum}/`);
                    } else {
                        lastPagePath = (fullDataUrl.endsWith('/') ? fullDataUrl : fullDataUrl + '/') + `page/${lastPageNum}/`;
                    }
                    const lastPageUrlForFetch = lastPagePath;
                    logInfo(`Workspaceing last page for ${type}: ${lastPageUrlForFetch}`);
                    const lastPageHtml = await fetchHttp(lastPageUrlForFetch);
                    if (!isScriptActive) return totalCount;
                    const lastPageDoc = parser.parseFromString(lastPageHtml, 'text/html');
                    const usersOnLastPage = lastPageDoc.querySelectorAll(CONFIG.PROFILE_FRIENDS_SELECTOR).length;
                    totalCount += usersOnLastPage;
                    logInfo(`Users on last page (${lastPageNum}) for ${type} (${fullDataUrl}): ${usersOnLastPage}. New total: ${totalCount}`);
                }
            }
            if (isScriptActive) saveToCache(cacheKey, totalCount, CONFIG.CACHE_EXPIRY_DATA_MS);
            return totalCount;
        } catch (error) {
            if (!error.message.includes("Script is deactivated") && !error.message.includes("Script deactivated during fetch")) {
                logError(`Failed to fetch paginated ${type} count for: ${fullDataUrl}`, error);
            }
            return totalCount;
        }
    }
    async function fetchUserWantList(userProfileBaseUrl) { /* ... (з v1.1.12) ... */
        if (!isScriptActive) return [];
        const cachedWantList = getFromCache(CONFIG.CACHE_KEY_WANT_LIST, CONFIG.CACHE_EXPIRY_WANT_LIST_MS);
        if (cachedWantList) { return cachedWantList; }
        logInfo('Fetching user want list...');
        let wantList = [];
        let currentPageUrl = (userProfileBaseUrl.endsWith('/') ? userProfileBaseUrl : userProfileBaseUrl + '/') + 'cards/need/page/1/';
        try {
            let pageCounter = 0;
            while (currentPageUrl && isScriptActive && pageCounter < 50) {
                pageCounter++;
                const htmlText = await fetchHttp(currentPageUrl);
                if (!isScriptActive) return wantList;
                const parser = new DOMParser();
                const doc = parser.parseFromString(htmlText, 'text/html');
                const cardsOnPage = doc.querySelectorAll(CONFIG.CARD_ITEM_SELECTOR);
                if (cardsOnPage.length === 0 && pageCounter > 1) break;
                cardsOnPage.forEach(cardElement => {
                    const cardId = cardElement.getAttribute('data-id');
                    if (cardId) wantList.push(cardId);
                });
                const paginationButton = doc.querySelector(`${CONFIG.PAGINATION_BUTTON_SELECTOR}[href]:not([href="${currentPageUrl.endsWith('/') ? currentPageUrl.slice(0,-1) : currentPageUrl}"]):not([href="#"]):not([href^="javascript:void"])`);
                let nextHref = paginationButton ? paginationButton.getAttribute('href') : null;
                if (nextHref) {
                    try {
                         currentPageUrl = new URL(nextHref, currentPageUrl).href;
                    } catch (e) {
                        logError("Error constructing next page URL for want list:", nextHref, e);
                        currentPageUrl = null;
                    }
                } else {
                    currentPageUrl = null;
                }
                 if (currentPageUrl && isScriptActive) await delay(CONFIG.DELAY_FAST_MS / 2);
            }
            if (isScriptActive) {
                saveToCache(CONFIG.CACHE_KEY_WANT_LIST, wantList, CONFIG.CACHE_EXPIRY_WANT_LIST_MS);
                logInfo('Want list fetched and cached:', wantList.length, 'cards.');
            }
            return wantList;
        } catch (error) {
            if (!error.message.includes("Script is deactivated") && !error.message.includes("Script deactivated during fetch")) {
                logError('Failed to fetch user want list from:', userProfileBaseUrl, error);
            }
            return wantList;
        }
    }
    async function displayCardStatistics(cardElementWrapper, cardId) { /* ... (з v1.1.12) ... */
        if (!isScriptActive || !baseUrl || !cardId || cardElementWrapper.querySelector(`.${CONFIG.INFO_CONTAINER_CLASS}`)) {
            return;
        }
        let needCount = 0;
        let tradeCount = 0;
        let source = "unknown";
        try {
            const directStats = await fetchCardStatsDirectly(cardId);
            if (directStats && typeof directStats.needCount === 'number' && typeof directStats.tradeCount === 'number') {
                needCount = directStats.needCount;
                tradeCount = directStats.tradeCount;
                source = "direct";
                logInfo(`Using direct stats for card ${cardId}: N=${needCount}, T=${tradeCount}`);
            } else {
                logInfo(`Direct stats failed for card ${cardId}, falling back to paginated count.`);
                const needUrlPath = `cards/${cardId}/users/need/`;
                const tradeUrlPath = `cards/${cardId}/users/trade/`;
                const absoluteNeedUrl = new URL(needUrlPath, baseUrl).href;
                const absoluteTradeUrl = new URL(tradeUrlPath, baseUrl).href;
                const [fetchedNeed, fetchedTrade] = await Promise.all([
                    fetchUserCount(absoluteNeedUrl, "need"),
                    fetchUserCount(absoluteTradeUrl, "trade")
                ]);
                needCount = fetchedNeed;
                tradeCount = fetchedTrade;
                source = "paginated_fallback";
                logInfo(`Using paginated fallback stats for card ${cardId}: N=${needCount}, T=${tradeCount}`);
            }
            if (!isScriptActive) return;
            const { infoContainer, needContainer, tradeContainer } = createCardInfoElements();
            infoContainer.style.backgroundColor = getRatingColor(needCount, tradeCount);
            const textColor = getTextForegroundColor();
            needContainer.style.color = textColor;
            tradeContainer.style.color = textColor;
            needContainer.textContent = `Need: ${needCount}`;
            tradeContainer.textContent = `Trade: ${tradeCount}`;
            infoContainer.setAttribute('data-fetch-source', source);
            cardElementWrapper.appendChild(infoContainer);
            const wantList = getFromCache(CONFIG.CACHE_KEY_WANT_LIST, CONFIG.CACHE_EXPIRY_WANT_LIST_MS);
            if (wantList && wantList.includes(cardId)) {
                cardElementWrapper.classList.add(CONFIG.WANTED_BY_USER_CLASS);
            }
        } catch (error) {
             if (!error.message.includes("Script is deactivated") && !error.message.includes("Script deactivated during fetch")) {
                logError('Error in displayCardStatistics for cardId:', cardId, error);
            }
        }
    }
    async function processCardElements(selector, batchSize, processingDelayMs, isTradeItem = false) { /* ... */
        if (!isScriptActive) return;
        const cardElements = document.querySelectorAll(selector);
        if (cardElements.length === 0) return;
        const effectiveBatchSize = batchSize;
        for (let i = 0; i < cardElements.length; i += effectiveBatchSize) {
            if (!isScriptActive) break;
            const batch = Array.from(cardElements).slice(i, i + effectiveBatchSize);
            const promises = [];
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
            try { await Promise.all(promises); } catch(e) { /* Ігноруємо помилки деактивації */ }
            if (i + effectiveBatchSize < cardElements.length && isScriptActive) {
                let accumulatedDelay = 0;
                while (accumulatedDelay < processingDelayMs && isScriptActive) {
                    const currentChunk = Math.min(CONFIG.DELAY_CHUNK_MS, processingDelayMs - accumulatedDelay);
                    await delay(currentChunk);
                    accumulatedDelay += CONFIG.DELAY_CHUNK_MS;
                }
            }
        }
    }
    function _allCardsClickListener() { /* ... */
         if (!isScriptActive) return;
        logInfo('Clicked "All Anime Cards". Refreshing full page cards info...');
        setTimeout(async () => {
            if (!isScriptActive) return;
            await processCardElements(CONFIG.SELECTORS_PAGES.fullPageCards, CONFIG.DEFAULT_BATCH_SIZE, CONFIG.DELAY_FAST_MS);
        }, 300);
    }
    function setupAllCardsButtonListener(doSetup) { /* ... */
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
    function manageFeatureStyles(add) { /* ... (версія з іконкою) ... */
        if (add && isScriptActive) {
            if (!featureStyleElement) {
                featureStyleElement = document.createElement('style');
                featureStyleElement.id = 'card-info-feature-styles';
                featureStyleElement.textContent = `
                    .${CONFIG.WANTED_BY_USER_CLASS} { position: relative !important; }
                    .${CONFIG.WANTED_BY_USER_CLASS}::after {
                        content: '⭐'; position: absolute; top: 5px; left: 5px;
                        z-index: 5; font-size: 16px; line-height: 1;
                        background-color: rgba(0, 0, 0, 0.6); border-radius: 3px; padding: 1px 3px;
                    }`;
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
    function removeAddedUIElements() { /* ... (без логіки HOT) ... */
        document.querySelectorAll(`.${CONFIG.INFO_CONTAINER_CLASS}`).forEach(el => el.remove());
        document.querySelectorAll(`.${CONFIG.WANTED_BY_USER_CLASS}`).forEach(el => {
            el.classList.remove(CONFIG.WANTED_BY_USER_CLASS);
        });
    }
    async function runActiveFeatures() { /* ... (з логуванням для DEBUG) ... */
        logInfo('[RUN_ACTIVE] Starting runActiveFeatures...');
        if (!isScriptActive) {
            logInfo('[RUN_ACTIVE] Script not active, returning.');
            return;
        }
        initializeBaseUrl();
        await delay(50);
        if (!baseUrl) {
            logError('Base URL is not defined. Script cannot run features dependent on it.');
            if (controlButton) controlButton.disabled = false; // Re-enable button if critical error occurs
            return;
        }
        logInfo('Running active features after baseUrl check...');
        try {
            setupThemeObserver();
            manageFeatureStyles(true);
            updateButtonAppearance();
            const userAvatar = document.querySelector(CONFIG.USER_AVATAR_SELECTOR);
            const userName = userAvatar ? userAvatar.getAttribute('title') : null;
            if (userName && isScriptActive) { // baseUrl вже перевірено
                const userProfileUrl = new URL(`user/${userName}/`, baseUrl).href;
                await fetchUserWantList(userProfileUrl);
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
                const containerElement = document.querySelector(check.selector);
                if (containerElement) {
                     await processCardElements(check.selector, check.batch, check.delay, check.trade);
                }
            }
            if (isScriptActive) {
                setupAllCardsButtonListener(true);
                updateTextColorForThemeChange();
            }
            logInfo('[RUN_ACTIVE] Finished runActiveFeatures successfully.');
        } catch (error) {
            logError("Error within runActiveFeatures: ", error);
            if (controlButton) controlButton.disabled = false; // Re-enable button on error
            updateButtonAppearance(); // Reflect current state even if error
        }
    }

    // --- Керування станом (з доданим логуванням) ---
    function activateScriptFeatures() {
        logInfo('[ACTIVATE] Called.'); // <<< LOG
        isScriptActive = true;
        localStorage.setItem(CONFIG.SCRIPT_ACTIVE_STATE_KEY, JSON.stringify(isScriptActive));
        logInfo('Script Activated.');
        if (controlButton) {
            logInfo('[ACTIVATE] Disabling button.'); // <<< LOG
            controlButton.disabled = true;
            controlButton.dataset.selfDisabled = 'true';
        }

        runActiveFeatures()
            .catch(err => {
                 logError("Critical error during runActiveFeatures in activateScriptFeatures:", err);
            })
            .finally(() => {
                logInfo('[ACTIVATE] Finally block.'); // <<< LOG
                if (controlButton) {
                    controlButton.disabled = false;
                    delete controlButton.dataset.selfDisabled;
                    logInfo('[ACTIVATE] Button re-enabled in finally.'); // <<< LOG
                }
                updateButtonAppearance();
            });
    }
    function deactivateScriptFeatures() {
        logInfo('[DEACTIVATE] Called.'); // <<< LOG
        isScriptActive = false;
        localStorage.setItem(CONFIG.SCRIPT_ACTIVE_STATE_KEY, JSON.stringify(isScriptActive));
        logInfo('Script Deactivated.');
        if (controlButton) {
            logInfo('[DEACTIVATE] Disabling button.'); // <<< LOG
            controlButton.disabled = true;
            controlButton.dataset.selfDisabled = 'true';
        }
        try {
            ongoingRequests = {};
            logInfo('[DEACTIVATE] Cleaning UI...'); // <<< LOG
            removeAddedUIElements();
            logInfo('[DEACTIVATE] Managing styles (remove)...'); // <<< LOG
            manageFeatureStyles(false);
            logInfo('[DEACTIVATE] Disconnecting theme observer...'); // <<< LOG
            if (themeObserver) { themeObserver.disconnect(); }
            logInfo('[DEACTIVATE] Removing all cards listener...'); // <<< LOG
            setupAllCardsButtonListener(false);
            logInfo('[DEACTIVATE] Clearing pulse interval...'); // <<< LOG
            if (controlButtonPulseIntervalId) {
                clearInterval(controlButtonPulseIntervalId);
                controlButtonPulseIntervalId = null;
            }
            logInfo('[DEACTIVATE] Cleanup finished.'); // <<< LOG
        } catch(err) {
             logError('[DEACTIVATE] Error during cleanup:', err); // <<< LOG Error
        }

        if (controlButton) {
            controlButton.disabled = false;
            delete controlButton.dataset.selfDisabled;
            logInfo('[DEACTIVATE] Button re-enabled.'); // <<< LOG
        }
        updateButtonAppearance();
     }
    function updateButtonAppearance() { /* ... (без змін) ... */
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
    function createControlButton() { /* ... (з виправленим listener) ... */
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
             try { document.body.appendChild(controlButton); }
             catch(e) { logError("Failed to append control button:", e); return; }
        }
        updateButtonAppearance();

        if (!controlButton.dataset.listenerAttached) {
            controlButton.addEventListener('click', () => {
                logInfo(`[BUTTON CLICK] Click received. Current isScriptActive: ${isScriptActive}, Button disabled state before action: ${controlButton.disabled}`);
                if (controlButton.disabled && controlButton.dataset.selfDisabled === 'true') {
                     logInfo('[BUTTON CLICK] Click ignored, button is already performing an action.');
                     return;
                }
                controlButton.disabled = true;
                controlButton.dataset.selfDisabled = 'true';
                logInfo('[BUTTON CLICK] Button set to disabled for action.');

                if (isScriptActive) {
                    logInfo('[BUTTON CLICK] Calling deactivateScriptFeatures...');
                    deactivateScriptFeatures(); // <<< ВИПРАВЛЕНО
                } else {
                    logInfo('[BUTTON CLICK] Calling activateScriptFeatures...');
                    activateScriptFeatures();   // <<< ВИПРАВЛЕНО
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
         logInfo('[INIT] initialSetup called.');
         loadState(); // <<< ВИКЛИК ВИПРАВЛЕНОЇ ФУНКЦІЇ
         createControlButton();
        if (isScriptActive) {
            logInfo('[INIT] Script is active, calling activateScriptFeatures with delay.');
            setTimeout(activateScriptFeatures, 500);
        } else {
            logInfo('Script starts in DEACTIVATED state as per saved preference.');
            updateButtonAppearance();
        }
    }
    try {
        if (document.readyState === 'loading') {
            window.addEventListener('DOMContentLoaded', initialSetup);
        } else {
            initialSetup();
        }
    } catch(e) {
         console.error("[Cards Info Script] Critical error during initial event listener setup:", e);
    }

})();
