// ==UserScript==
// @name         Cards Info Rate Cache (Button Integration v3 - Fix Visibility)
// @namespace    http://tampermonkey.net/
// @version      1.1.24
// @description  Displays card statistics. Button integrated into header. Fixes button visibility on disable. SVG sizes by CSS.
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
        WANT_LIST_HIGHLIGHT_REFRESH_INTERVAL_MS: 60 * 1000,
        DEFAULT_BATCH_SIZE: 7,
        LOOTBOX_BATCH_SIZE: 3,
        DELAY_NORMAL_MS: 2500,
        DELAY_FAST_MS: 200,
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
        },
        PAGINATION_SELECTOR: '.pagination__pages',
        PAGINATION_BUTTON_SELECTOR: '.pagination__pages-btn a',
        PROFILE_FRIENDS_SELECTOR: '.profile__friends-item',
        DARK_THEME_CLASS: 'dark-theme',
        INFO_CONTAINER_CLASS: 'card-stats-info-container',
        WANTED_BY_USER_CLASS: 'anime-cards__wanted-by-user',
        CACHE_PREFIX_DATA: 'cardData_v20-',
        CACHE_PREFIX_DIRECT_STATS: 'cardDirectStats_v20-',
        CACHE_KEY_WANT_LIST: 'currentUserWantList_v20',
        CONTROL_BUTTON_ID: 'card-info-toggle-button',
        SCRIPT_ACTIVE_STATE_KEY: 'cardInfoScriptActiveState_v1_1_24', // Updated version
        DIRECT_STATS_PAGE_URL_TEMPLATE: "/cards/{cardId}/users/",
        DIRECT_NEED_COUNT_SELECTOR: "#owners-need",
        DIRECT_TRADE_COUNT_SELECTOR: "#owners-trade",
        ITEMS_PER_USER_LIST_PAGE: 50,
        DEBUG_LOGS: false,
        CSS_VAR_HEADER_TEXT_COLOR: '--script-header-txt-color',
        CSS_VAR_ICON_ACTIVE_COLOR: '--script-icon-active-color',
        CSS_VAR_ICON_INACTIVE_COLOR: '--script-icon-inactive-color',
        HEADER_SELECTOR: 'header.header',
        HEADER_GROUP_MENU_SELECTOR: '.header__group-menu',
        BUTTON_INTEGRATED_CLASS: 'header__card-info-toggle',
        BUTTON_PI_CENTER_CLASS: 'pi-center'
    };

    let baseUrl = "";
    let ongoingRequests = {};
    let isScriptActive;
    let themeObserver = null;
    let controlButton = null;
    let featureStyleElement = null;
    let allCardsButtonListener = null;
    let controlButtonPulseIntervalId = null;
    let cardIntersectionObserver = null;
    let processedCardIds = new Set();
    let wantListHighlightRefreshIntervalId = null;
    let currentUserProfileUrl = null;
    let isButtonIntegratedInHeader = false;

    // SVGs with width/height removed for CSS sizing, viewBox and fill="currentColor" retained
    const eyeOnIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`;
    const eyeOffIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.44-4.75C21.27 7.61 17 4.5 12 4.5c-1.6 0-3.14.39-4.54 1.08L9.17 7.36C9.74 7.13 10.35 7 11 7zm-1.07 7.93l2.83 2.83C12.74 18.87 12 19.5 12 19.5c-5 0-9.27-3.11-11-7.5 1.04-2.58 3.03-4.69 5.44-6.06L9.93 9.07zM2.71 3.29a1 1 0 00-1.42 1.42l1.63 1.63C1.31 7.97.16 10.13 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l1.62 1.62a1 1 0 001.42-1.42L2.71 3.29zM12 17c-2.76 0-5-2.24-5-5 0-.77.18-1.49.5-2.14l1.57 1.57c-.01.19-.07.38-.07.57 0 1.66 1.34 3 3 3 .19 0 .38-.06.57-.07L14.14 16.5c-.65.32-1.37.5-2.14.5z"/></svg>`;

    function logError(...args) { console.error('[Cards Info Script]', ...args); }
    function logInfo(...args) { if (CONFIG.DEBUG_LOGS) console.log('[Cards Info Script]', ...args); }
    function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    // --- Functions from loadState to getCardIdFromWrapper remain unchanged ---
    function loadState() {
        logInfo('[LOAD_STATE] Loading script active state...');
        const savedState = localStorage.getItem(CONFIG.SCRIPT_ACTIVE_STATE_KEY);
        isScriptActive = (savedState !== null) ? JSON.parse(savedState) : true;
        logInfo('[LOAD_STATE] Loaded state from localStorage:', isScriptActive);
    }
    function saveToCache(key, data, expiryMs) {
        try {
            const item = { timestamp: Date.now(), data: data };
            localStorage.setItem(key, JSON.stringify(item));
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
            if (preconnectLink && preconnectLink.href) {
                baseUrl = preconnectLink.href;
                if (!baseUrl.startsWith('http')) {
                    baseUrl = new URL(baseUrl, window.location.origin).href;
                }
            } else {
                baseUrl = window.location.origin + '/';
                logInfo(`Base URL from <link rel="preconnect"> not found or invalid. Using current origin: ${baseUrl}`);
            }
            if (baseUrl && !baseUrl.endsWith('/')) { baseUrl += '/'; }
            logInfo('Base URL determined:', baseUrl);
        } catch (error) {
            logError('Error initializing base URL:', error);
            baseUrl = window.location.origin + '/';
            logInfo('Fallback Base URL due to error:', baseUrl);
        }
       if (!baseUrl) { logError('Base URL is still empty after initialization attempts!'); }
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
        if (!isScriptActive) {
            // If script is off, but button is integrated, we still might need to update its icon color
            // if the theme changes, because manageFeatureStyles will update CSS vars.
            // So, call manageFeatureStyles to refresh CSS vars, then updateButtonAppearance.
            if (isButtonIntegratedInHeader && controlButton) {
                manageFeatureStyles();
                updateButtonAppearance();
            }
            return;
        }
        const newColor = getTextForegroundColor();
        document.querySelectorAll(`.${CONFIG.INFO_CONTAINER_CLASS} div`).forEach(div => {
            div.style.color = newColor;
        });
        manageFeatureStyles(); // Re-apply styles to update CSS variables based on new theme
        updateButtonAppearance(); // Refresh button appearance which uses these CSS vars
    }

    function setupThemeObserver() {
        if (themeObserver) { themeObserver.disconnect(); }
        themeObserver = new MutationObserver(mutationsList => {
            for (const mutation of mutationsList) {
                if (mutation.attributeName === 'class' && mutation.target === document.body) {
                    updateTextColorForThemeChange();
                    break;
                }
            }
        });
        themeObserver.observe(document.body, { attributes: true });
    }
    async function fetchHttp(url) { /* ... (no changes) ... */
        if (!isScriptActive) return Promise.reject(new Error("Script is deactivated. Request cancelled."));
        let absoluteUrl = url;
        if (!url.startsWith('http') && baseUrl) {
            try { absoluteUrl = new URL(url, baseUrl).href; }
            catch (e) { logError(`Invalid URL construction: path="${url}", base="${baseUrl}"`, e); return Promise.reject(new Error(`Invalid URL: ${url}`));}
        } else if (!url.startsWith('http') && !baseUrl) {
             logError(`Cannot make relative request, baseUrl is not set. URL: ${url}`);
             return Promise.reject(new Error(`Cannot make relative request, baseUrl is not set. URL: ${url}`));
        }
        if (ongoingRequests[absoluteUrl]) { return ongoingRequests[absoluteUrl]; }
        ongoingRequests[absoluteUrl] = new Promise((resolve, reject) => {
            if (!isScriptActive) { delete ongoingRequests[absoluteUrl]; return reject(new Error("Script is deactivated. Request cancelled before sending.")); }
            logInfo(`Workspaceing: ${absoluteUrl}`);
            GM_xmlhttpRequest({
                method: 'GET', url: absoluteUrl,
                onload: function (response) {
                    delete ongoingRequests[absoluteUrl];
                    if (!isScriptActive && response.status >= 200 && response.status < 300) { return reject(new Error(`Script deactivated during fetch for ${absoluteUrl}`)); }
                    if (response.status >= 200 && response.status < 300) { resolve(response.responseText); }
                    else { reject(new Error(`HTTP error ${response.status} for ${absoluteUrl}. Response: ${response.statusText}`)); }
                },
                onerror: function (error) { delete ongoingRequests[absoluteUrl]; logError('GM_xmlhttpRequest error for:', absoluteUrl, error); reject(error); },
                ontimeout: function () { delete ongoingRequests[absoluteUrl]; logError('GM_xmlhttpRequest timeout for:', absoluteUrl); reject(new Error(`Timeout for ${absoluteUrl}`)); }
            });
        });
        return ongoingRequests[absoluteUrl];
    }
    async function fetchCardStatsDirectly(cardId) { /* ... (no changes) ... */
        if (!isScriptActive || !baseUrl) return null;
        const relativePath = CONFIG.DIRECT_STATS_PAGE_URL_TEMPLATE.replace('{cardId}', cardId);
        const statsPageUrlForFetch = relativePath;
        const cacheKey = CONFIG.CACHE_PREFIX_DIRECT_STATS + cardId;
        const cachedData = getFromCache(cacheKey, CONFIG.CACHE_EXPIRY_DATA_MS);
        if (cachedData) { logInfo(`[D_FETCH] Cache HIT for direct stats (cardId: ${cardId})`); return cachedData; }
        logInfo(`[D_FETCH] Fetching direct stats for cardId: ${cardId} (path: ${statsPageUrlForFetch})`);
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
                logInfo(`[D_FETCH] Fetched direct for cardId ${cardId}: N=${stats.needCount}, T=${stats.tradeCount}`);
                return stats;
            } else {
                logInfo(`[D_FETCH] Direct stat elements NOT FOUND for cardId: ${cardId}. Need el: ${!!needElement}, Trade el: ${!!tradeElement}`);
                return null;
            }
        } catch (error) {
            if (!error.message.includes("Script is deactivated")) { logError(`[D_FETCH] Failed for cardId: ${cardId}`, error); }
            return null;
        }
    }
    async function fetchUserCount(fullDataUrl, type) { /* ... (no changes) ... */
        if (!isScriptActive) return 0;
        const cacheKey = CONFIG.CACHE_PREFIX_DATA + fullDataUrl.replace(/[^a-zA-Z0-9]/g, '_');
        const cachedCount = getFromCache(cacheKey, CONFIG.CACHE_EXPIRY_DATA_MS);
        if (cachedCount !== null) { logInfo(`[U_COUNT] Cache HIT for ${type} (url: ${fullDataUrl}): ${cachedCount}`); return cachedCount; }
        logInfo(`[U_COUNT] Fetching paginated ${type} for URL: ${fullDataUrl}`);
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
                    if (pageNumMatch) { const pageNum = parseInt(pageNumMatch[0], 10); if (pageNum > lastPageNum) lastPageNum = pageNum; }
                    else { const hrefPageMatch = link.href.match(/\/page\/(\d+)\/?$/); if (hrefPageMatch) { const pageNum = parseInt(hrefPageMatch[1], 10); if (pageNum > lastPageNum) lastPageNum = pageNum; } }
                 });
                if (lastPageNum > 1) {
                    totalCount = (lastPageNum - 1) * CONFIG.ITEMS_PER_USER_LIST_PAGE;
                    let lastPagePath;
                    if (fullDataUrl.includes('/page/')) { lastPagePath = fullDataUrl.replace(/\/page\/\d+\/?$/, `/page/${lastPageNum}/`);}
                    else { lastPagePath = (fullDataUrl.endsWith('/') ? fullDataUrl : fullDataUrl + '/') + `page/${lastPageNum}/`; }
                    const lastPageHtml = await fetchHttp(lastPagePath);
                    if (!isScriptActive) return totalCount;
                    const lastPageDoc = parser.parseFromString(lastPageHtml, 'text/html');
                    totalCount += lastPageDoc.querySelectorAll(CONFIG.PROFILE_FRIENDS_SELECTOR).length;
                }
            }
            if (isScriptActive) saveToCache(cacheKey, totalCount, CONFIG.CACHE_EXPIRY_DATA_MS);
            logInfo(`[U_COUNT] Fetched for ${type} (${fullDataUrl}): ${totalCount}`);
            return totalCount;
        } catch (error) {
            if (!error.message.includes("Script is deactivated")) { logError(`[U_COUNT] Failed for ${type} URL: ${fullDataUrl}`, error); }
            return totalCount;
        }
    }
    async function fetchUserWantList(userProfileBaseUrlParam) { /* ... (no changes) ... */
        if (!isScriptActive) return [];
        if (!userProfileBaseUrlParam) { logError("User profile URL is not provided to fetchUserWantList."); return getFromCache(CONFIG.CACHE_KEY_WANT_LIST, CONFIG.CACHE_EXPIRY_WANT_LIST_MS) || []; }
        const cachedWantList = getFromCache(CONFIG.CACHE_KEY_WANT_LIST, CONFIG.CACHE_EXPIRY_WANT_LIST_MS);
        if (cachedWantList) { logInfo("Want list from cache."); return cachedWantList; }
        logInfo('Fetching user want list from server...');
        let wantList = [];
        let currentPageUrl = (userProfileBaseUrlParam.endsWith('/') ? userProfileBaseUrlParam : userProfileBaseUrlParam + '/') + 'cards/need/page/1/';
        try {
            let pageCounter = 0;
            while (currentPageUrl && isScriptActive && pageCounter < 50) {
                pageCounter++;
                logInfo(`Workspaceing want list page ${pageCounter}: ${currentPageUrl}`);
                const htmlText = await fetchHttp(currentPageUrl);
                if (!isScriptActive) break;
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
                if (nextHref) { try { currentPageUrl = new URL(nextHref, currentPageUrl).href; } catch (e) { logError("Error constructing next page URL for want list:", nextHref, e); currentPageUrl = null; } }
                else { currentPageUrl = null; }
                if (currentPageUrl && isScriptActive) await delay(CONFIG.DELAY_FAST_MS / 2);
            }
            if (isScriptActive) { saveToCache(CONFIG.CACHE_KEY_WANT_LIST, wantList, CONFIG.CACHE_EXPIRY_WANT_LIST_MS); logInfo('Want list fetched and cached:', wantList.length, 'cards.'); }
            return wantList;
        } catch (error) {
            if (!error.message.includes("Script is deactivated")) { logError('Failed to fetch user want list from:', userProfileBaseUrlParam, error); }
            return wantList;
        }
    }
    function getCardIdFromWrapper(wrapperElement) { /* ... (no changes) ... */
        if (!wrapperElement) { return null; }
        let cardId = null;
        if (wrapperElement.matches(CONFIG.SELECTORS_PAGES.tradeItems)) {
            const href = wrapperElement.getAttribute('href');
            if (href) { const parts = href.split('/'); const cardsIndex = parts.indexOf('cards'); if (cardsIndex !== -1 && parts.length > cardsIndex + 1) cardId = parts[cardsIndex + 1]; }
        } else {
            const cardItem = wrapperElement.matches(CONFIG.CARD_ITEM_SELECTOR) ? wrapperElement : wrapperElement.querySelector(CONFIG.CARD_ITEM_SELECTOR);
            if (cardItem) cardId = cardItem.getAttribute('data-id');
            else if (wrapperElement.classList.contains('lootbox__card')) cardId = wrapperElement.getAttribute('data-id');
        }
        return cardId;
    }
    async function displayCardStatistics(cardElementWrapper, cardId) { /* ... (no changes from 1.1.20 logic) ... */
        logInfo(`[displayCardStatistics v1.1.20] Called for cardId: ${cardId}`);
        if (!isScriptActive) { logInfo(`[displayCardStatistics] Script not active for ${cardId}. Exiting.`); return; }
        if (!baseUrl) { logError(`[displayCardStatistics] BaseURL not set for ${cardId}. Exiting.`); return; }
        if (!cardId) { logInfo(`[displayCardStatistics] No cardId provided. Exiting.`); return; }
        if (!cardElementWrapper) { logError(`[displayCardStatistics] No cardElementWrapper for ${cardId}. Exiting.`); return; }
        const oldInfoContainer = cardElementWrapper.querySelector(`.${CONFIG.INFO_CONTAINER_CLASS}`);
        if (oldInfoContainer) {
            logInfo(`[displayCardStatistics] Removing PREVIOUS info container from THIS WRAPPER for cardId: ${cardId}.`);
            oldInfoContainer.remove();
        }
        if (processedCardIds.has(cardId)) {
            logInfo(`[displayCardStatistics] Card ${cardId} is ALREADY in processedCardIds. Skipping new data fetch/append for this wrapper.`);
            const wantList = getFromCache(CONFIG.CACHE_KEY_WANT_LIST, CONFIG.CACHE_EXPIRY_WANT_LIST_MS);
             if (wantList) {
                 if (wantList.includes(cardId)) {
                     if(!cardElementWrapper.classList.contains(CONFIG.WANTED_BY_USER_CLASS)) cardElementWrapper.classList.add(CONFIG.WANTED_BY_USER_CLASS);
                 } else {
                     if(cardElementWrapper.classList.contains(CONFIG.WANTED_BY_USER_CLASS)) cardElementWrapper.classList.remove(CONFIG.WANTED_BY_USER_CLASS);
                 }
            }
            return;
        }
        processedCardIds.add(cardId);
        logInfo(`[displayCardStatistics] Card ${cardId} marked as PENDING (added to processedCardIds). Total in set: ${processedCardIds.size}`);
        let needCount = 0;
        let tradeCount = 0;
        let source = "unknown";
        let statsFetchedSuccessfully = false;
        try {
            logInfo(`[displayCardStatistics] Attempting to fetch stats for cardId: ${cardId}`);
            const directStats = await fetchCardStatsDirectly(cardId);
            if (directStats && typeof directStats.needCount === 'number' && typeof directStats.tradeCount === 'number') {
                needCount = directStats.needCount;
                tradeCount = directStats.tradeCount;
                source = "direct";
                statsFetchedSuccessfully = true;
            } else {
                logInfo(`[displayCardStatistics] Direct stats failed for card ${cardId}, falling back to paginated count.`);
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
                statsFetchedSuccessfully = true;
            }
            if (!isScriptActive) {
                logInfo(`[displayCardStatistics] Script deactivated during fetch for cardId: ${cardId}. Removing from processedCardIds.`);
                processedCardIds.delete(cardId);
                return;
            }
            if (statsFetchedSuccessfully) {
                logInfo(`[displayCardStatistics] Creating info for ${cardId}: N=${needCount}, T=${tradeCount} (Source: ${source})`);
                const { infoContainer, needContainer, tradeContainer } = createCardInfoElements();
                infoContainer.style.backgroundColor = getRatingColor(needCount, tradeCount);
                const textColor = getTextForegroundColor();
                needContainer.style.color = textColor;
                tradeContainer.style.color = textColor;
                needContainer.textContent = `Need: ${needCount}`;
                tradeContainer.textContent = `Trade: ${tradeCount}`;
                infoContainer.setAttribute('data-fetch-source', source);
                const existingPanelAfterFetch = cardElementWrapper.querySelector(`.${CONFIG.INFO_CONTAINER_CLASS}`);
                if (!existingPanelAfterFetch) {
                    cardElementWrapper.appendChild(infoContainer);
                    logInfo(`[displayCardStatistics] Info container appended for cardId: ${cardId}. It REMAINS in processedCardIds.`);
                } else {
                     logInfo(`[displayCardStatistics] Panel for ${cardId} appeared on THIS WRAPPER during fetch. Not appending duplicate. It REMAINS in processedCardIds.`);
                }
            } else {
                logInfo(`[displayCardStatistics] No stats data obtained for cardId: ${cardId}. Not appending. Removing from processedCardIds.`);
                processedCardIds.delete(cardId);
            }
            const wantList = getFromCache(CONFIG.CACHE_KEY_WANT_LIST, CONFIG.CACHE_EXPIRY_WANT_LIST_MS);
            if (wantList && wantList.includes(cardId)) {
                cardElementWrapper.classList.add(CONFIG.WANTED_BY_USER_CLASS);
            } else {
                cardElementWrapper.classList.remove(CONFIG.WANTED_BY_USER_CLASS);
            }
            logInfo(`[displayCardStatistics] Finished all processing for cardId: ${cardId}. Processed IDs count: ${processedCardIds.size}`);
        } catch (error) {
            logError(`[displayCardStatistics] Error processing cardId: ${cardId}`, error);
            logInfo(`[displayCardStatistics] Removing ${cardId} from processedCardIds due to error.`);
            processedCardIds.delete(cardId);
        }
    }
    const observerCallback = (entries, observer) => { /* ... (no changes from 1.1.20 logic) ... */
        if (!isScriptActive) return;
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const cardWrapper = entry.target;
                const cardId = getCardIdFromWrapper(cardWrapper);
                if (cardId && !processedCardIds.has(cardId)) {
                    logInfo(`[Observer] Card ${cardId} intersecting. NOT in processedCardIds. Calling displayCardStatistics.`);
                    displayCardStatistics(cardWrapper, cardId);
                } else if (cardId) {
                     const wantList = getFromCache(CONFIG.CACHE_KEY_WANT_LIST, CONFIG.CACHE_EXPIRY_WANT_LIST_MS);
                     if (wantList && wantList.includes(cardId)) {
                         if(!cardWrapper.classList.contains(CONFIG.WANTED_BY_USER_CLASS)) cardWrapper.classList.add(CONFIG.WANTED_BY_USER_CLASS);
                     } else {
                         if(cardWrapper.classList.contains(CONFIG.WANTED_BY_USER_CLASS)) cardWrapper.classList.remove(CONFIG.WANTED_BY_USER_CLASS);
                     }
                }
                observer.unobserve(cardWrapper);
            }
        });
    };
    function initializeCardObservers() { /* ... (no changes from 1.1.20 logic) ... */
        if (!isScriptActive || cardIntersectionObserver) return;
        logInfo("Initializing IntersectionObserver for cards...");
        try {
            cardIntersectionObserver = new IntersectionObserver(observerCallback, {
                root: null, rootMargin: '0px 0px 200px 0px', threshold: 0.01
            });
            Object.values(CONFIG.SELECTORS_PAGES).forEach(selector => {
                if (typeof selector === 'string' && selector !== CONFIG.SELECTORS_PAGES.allAnimeCardsButton) {
                    document.querySelectorAll(selector).forEach(cardWrapper => {
                           cardIntersectionObserver.observe(cardWrapper);
                    });
                }
            });
        } catch(e) {logError("Error during initial observe setup:", e); cardIntersectionObserver = null;}
    }
    async function processCardsInBackground() { /* ... (no changes from 1.1.20 logic, uses updated displayCardStatistics) ... */
        if (!isScriptActive) return;
        logInfo("Starting background processing of cards (stats only)...");
        for (const pageType of Object.keys(CONFIG.SELECTORS_PAGES)) {
            if (!isScriptActive) break;
            const selector = CONFIG.SELECTORS_PAGES[pageType];
            if (typeof selector !== 'string' || selector === CONFIG.SELECTORS_PAGES.allAnimeCardsButton) {
                continue;
            }
            const cardElements = document.querySelectorAll(selector);
            if (cardElements.length === 0) continue;
            logInfo(`Background processing for selector: ${selector} (${cardElements.length} items)`);
            let delayMs = CONFIG.DELAY_NORMAL_MS;
            if (pageType === 'fullPageCards' || pageType === 'tradeItems' || pageType === 'lootboxCards') {
                delayMs = CONFIG.DELAY_FAST_MS;
            }
            const batchSize = (pageType === 'lootboxCards') ? CONFIG.LOOTBOX_BATCH_SIZE : CONFIG.DEFAULT_BATCH_SIZE;
            for (let i = 0; i < cardElements.length; i += batchSize) {
                if (!isScriptActive) break;
                const batch = Array.from(cardElements).slice(i, i + batchSize);
                const promises = [];
                for (const element of batch) {
                    if (!isScriptActive) break;
                    const cardId = getCardIdFromWrapper(element);
                    if (cardId && !processedCardIds.has(cardId)) {
                        promises.push(displayCardStatistics(element, cardId));
                    }
                }
                if (!isScriptActive) break;
                try { await Promise.all(promises); } catch(e) {/* ignore */}
                if (i + batchSize < cardElements.length && isScriptActive) {
                    let accumulatedDelay = 0;
                    while (accumulatedDelay < delayMs && isScriptActive) {
                        const currentChunk = Math.min(CONFIG.DELAY_CHUNK_MS, delayMs - accumulatedDelay);
                        await delay(currentChunk);
                        accumulatedDelay += CONFIG.DELAY_CHUNK_MS;
                    }
                }
            }
            if (!isScriptActive) break;
        }
        logInfo("Background processing (stats) finished (or interrupted).");
    }
    async function refreshWantedHighlights() { /* ... (no changes) ... */
        if (!isScriptActive || !currentUserProfileUrl) { return; }
        await fetchUserWantList(currentUserProfileUrl);
        const currentWantList = getFromCache(CONFIG.CACHE_KEY_WANT_LIST, CONFIG.CACHE_EXPIRY_WANT_LIST_MS);
        if (!currentWantList) { return; }
        let updatedCount = 0;
        Object.values(CONFIG.SELECTORS_PAGES).forEach(selector => {
            if (typeof selector === 'string' && selector !== CONFIG.SELECTORS_PAGES.allAnimeCardsButton) {
                document.querySelectorAll(selector).forEach(cardWrapper => {
                    if (!isScriptActive) return;
                    const cardId = getCardIdFromWrapper(cardWrapper);
                    if (cardId) {
                        const isCurrentlyWanted = cardWrapper.classList.contains(CONFIG.WANTED_BY_USER_CLASS);
                        const shouldBeWanted = currentWantList.includes(cardId);
                        if (shouldBeWanted && !isCurrentlyWanted) { cardWrapper.classList.add(CONFIG.WANTED_BY_USER_CLASS); updatedCount++; }
                        else if (!shouldBeWanted && isCurrentlyWanted) { cardWrapper.classList.remove(CONFIG.WANTED_BY_USER_CLASS); updatedCount++; }
                    }
                });
            }
        });
        if(updatedCount > 0) logInfo(`Wanted highlights re-evaluated. ${updatedCount} cards updated.`);
    }
    function _allCardsClickListener() { /* ... (no changes) ... */
        if (!isScriptActive) return;
        logInfo('Button "All Anime Cards" clicked. Re-initiating processing...');
        if (cardIntersectionObserver) { cardIntersectionObserver.disconnect(); cardIntersectionObserver = null; logInfo("Previous IntersectionObserver stopped for 'All Cards'."); }
        removeAddedUIElements();
        processedCardIds.clear();
        logInfo("Cleared processed card IDs and removed UI elements for 'All Cards'.");
        setTimeout(async () => {
            if (!isScriptActive) return;
            logInfo("Proceeding with reprocessing after 'All Cards' click delay...");
            if (currentUserProfileUrl) {
                try {
                    await fetchUserWantList(currentUserProfileUrl);
                    if (!isScriptActive) return;
                    initializeCardObservers();
                    await delay(200);
                    if (!isScriptActive) return;
                    processCardsInBackground();
                } catch (e) { logError("Error during 'All Cards' reprocessing sequence:", e); }
            } else {
                logError("Cannot re-process all cards, userProfileUrl is not set.");
                initializeCardObservers();
                processCardsInBackground();
            }
            logInfo("Reprocessing initiated after 'All Cards' click.");
        }, 500);
    }
    function setupAllCardsButtonListener(doSetup) { /* ... (no changes) ... */
        const allCardsButton = document.querySelector(CONFIG.SELECTORS_PAGES.allAnimeCardsButton);
        if (allCardsButton) {
            if (allCardsButtonListener) { allCardsButton.removeEventListener('click', allCardsButtonListener); allCardsButtonListener = null; }
            if (doSetup && isScriptActive) { allCardsButtonListener = _allCardsClickListener; allCardsButton.addEventListener('click', allCardsButtonListener); logInfo("Listener for 'All Anime Cards' button SET UP."); }
        }
    }

    // --- UPDATED manageFeatureStyles ---
    function manageFeatureStyles() {
        if (!controlButton && !isScriptActive) { // If no button and script is off, no styles needed
            if (featureStyleElement && document.head.contains(featureStyleElement)) {
                document.head.removeChild(featureStyleElement);
                featureStyleElement = null;
            }
            return;
        }

        let stylesToApply = "";
        let cssVars = "";

        // CSS variables for colors should always be defined if the button exists,
        // reflecting the current theme.
        if (controlButton) {
            const currentThemeIsDark = isDarkThemeActive();
            // Define default colors carefully to be visible on both themes initially if var() fails
            const headerTextColorDefault = currentThemeIsDark ? '#c0c0c0' : '#444444';
            const activeIconColorDefault = currentThemeIsDark ? '#66bb6a' : '#28a745';

            cssVars = `
                :root {
                    ${CONFIG.CSS_VAR_HEADER_TEXT_COLOR}: ${headerTextColorDefault};
                    ${CONFIG.CSS_VAR_ICON_ACTIVE_COLOR}: ${activeIconColorDefault};
                    ${CONFIG.CSS_VAR_ICON_INACTIVE_COLOR}: ${headerTextColorDefault};
                }
            `;
        }

        if (isButtonIntegratedInHeader) {
            stylesToApply += `
                .${CONFIG.BUTTON_INTEGRATED_CLASS} svg {
                    width: 30px;  /* !!! ADJUST THIS TO MATCH OTHER HEADER ICONS !!! */
                    height: 30px; /* !!! ADJUST THIS TO MATCH OTHER HEADER ICONS !!! */
                    vertical-align: middle;
                }
                .${CONFIG.BUTTON_INTEGRATED_CLASS}:hover {
                    opacity: 0.7;
                }
            `;
        }

        if (isScriptActive) { // Feature-specific styles only when script is active
            stylesToApply += `
                .${CONFIG.WANTED_BY_USER_CLASS} {
                    position: relative !important;
                }
                .${CONFIG.WANTED_BY_USER_CLASS}::after {
                    content: '⭐'; position: absolute; top: 5px; left: 5px;
                    z-index: 5; font-size: 16px; line-height: 1;
                    background-color: rgba(0, 0, 0, 0.6); border-radius: 3px; padding: 1px 3px;
                }
            `;
        }

        if (cssVars || stylesToApply) {
            if (!featureStyleElement) {
                featureStyleElement = document.createElement('style');
                featureStyleElement.id = 'card-info-dynamic-styles';
                document.head.appendChild(featureStyleElement);
            }
            featureStyleElement.textContent = cssVars + stylesToApply;
        } else { // No styles to apply at all
            if (featureStyleElement && document.head.contains(featureStyleElement)) {
                document.head.removeChild(featureStyleElement);
                featureStyleElement = null;
            }
        }
    }

    function removeAddedUIElements() {
        logInfo("Removing all added UI elements (info containers and wanted stars)...");
        document.querySelectorAll(`.${CONFIG.INFO_CONTAINER_CLASS}`).forEach(el => el.remove());
        document.querySelectorAll(`.${CONFIG.WANTED_BY_USER_CLASS}`).forEach(el => { el.classList.remove(CONFIG.WANTED_BY_USER_CLASS); });
    }

    async function runActiveFeatures() {
        if (!isScriptActive) { return; }
        initializeBaseUrl();
        await delay(50);
        if (!baseUrl) {
            logError('Base URL is not defined. Script cannot run features dependent on it.');
            if (controlButton) controlButton.disabled = false; updateButtonAppearance();
            isScriptActive = false; localStorage.setItem(CONFIG.SCRIPT_ACTIVE_STATE_KEY, JSON.stringify(isScriptActive));
            return;
        }
        logInfo('[RUN_ACTIVE] Starting...');
        removeAddedUIElements();
        processedCardIds.clear();
        try {
            setupThemeObserver();
            manageFeatureStyles();      // Apply styles
            updateButtonAppearance();   // Update button appearance based on current state & styles

            const userAvatar = document.querySelector(CONFIG.USER_AVATAR_SELECTOR);
            const userName = userAvatar ? userAvatar.getAttribute('title') : null;
            if (userName) {
                currentUserProfileUrl = new URL(`user/${userName}/`, baseUrl).href;
                if(isScriptActive) await fetchUserWantList(currentUserProfileUrl);
            } else {
                logError("Could not determine user profile URL. Want list features might be limited.");
                currentUserProfileUrl = null;
            }

            if (!isScriptActive) return;
            initializeCardObservers();
            await delay(200);
            if (!isScriptActive) return;
            processCardsInBackground();
            setupAllCardsButtonListener(true);
            // updateTextColorForThemeChange(); // Called by setupThemeObserver if theme changes, or by manageFeatureStyles for initial setup indirectly

            if (isScriptActive && !wantListHighlightRefreshIntervalId && currentUserProfileUrl) {
                wantListHighlightRefreshIntervalId = setInterval(refreshWantedHighlights, CONFIG.WANT_LIST_HIGHLIGHT_REFRESH_INTERVAL_MS);
                logInfo(`Started periodic want list highlight refresh interval (${CONFIG.WANT_LIST_HIGHLIGHT_REFRESH_INTERVAL_MS}ms).`);
            }
            logInfo('[RUN_ACTIVE] Finished setup successfully.');
        } catch (error) {
            logError("Error within runActiveFeatures: ", error);
            if (controlButton) controlButton.disabled = false; updateButtonAppearance();
        }
    }

    function activateScriptFeatures() {
        logInfo('[ACTIVATE] Called.');
        if (isScriptActive && (cardIntersectionObserver || wantListHighlightRefreshIntervalId)) {
            logInfo('[ACTIVATE] Already active or main features running, returning.');
            if (controlButton) { controlButton.disabled = false; delete controlButton.dataset.selfDisabled; }
            return;
        }
        isScriptActive = true;
        localStorage.setItem(CONFIG.SCRIPT_ACTIVE_STATE_KEY, JSON.stringify(isScriptActive));
        logInfo('Script Activated.');
        if (controlButton) { controlButton.disabled = true; controlButton.dataset.selfDisabled = 'true'; }

        manageFeatureStyles(); // Apply styles for active state

        runActiveFeatures()
            .catch(err => { logError("Critical error during runActiveFeatures in activateScriptFeatures:", err); })
            .finally(() => {
                logInfo('[ACTIVATE] Finally block.');
                if (controlButton) { controlButton.disabled = false; delete controlButton.dataset.selfDisabled; }
                updateButtonAppearance();
            });
    }

    function deactivateScriptFeatures() {
        logInfo('[DEACTIVATE] Called.');
         if (!isScriptActive && !cardIntersectionObserver && !wantListHighlightRefreshIntervalId && !featureStyleElement) { // check featureStyleElement as well
            logInfo('[DEACTIVATE] Already inactive or main features not running, returning.');
            if (controlButton) { controlButton.disabled = false; delete controlButton.dataset.selfDisabled; }
            return;
        }
        isScriptActive = false;
        localStorage.setItem(CONFIG.SCRIPT_ACTIVE_STATE_KEY, JSON.stringify(isScriptActive));
        logInfo('Script Deactivated.');
        if (controlButton) { controlButton.disabled = true; controlButton.dataset.selfDisabled = 'true'; }
        try {
            if (cardIntersectionObserver) { cardIntersectionObserver.disconnect(); cardIntersectionObserver = null; logInfo("👀 IntersectionObserver stopped."); }
            if (wantListHighlightRefreshIntervalId) { clearInterval(wantListHighlightRefreshIntervalId); wantListHighlightRefreshIntervalId = null; logInfo("🚫 Stopped periodic want list highlight refresh interval.");}
            processedCardIds.clear();
            ongoingRequests = {};
            removeAddedUIElements(); // Removes stars etc.

            // manageFeatureStyles will now correctly leave essential button styles if integrated
            manageFeatureStyles();

            // themeObserver should remain to update button colors if site theme changes while script is OFF
            // if (themeObserver) { themeObserver.disconnect(); }
            setupAllCardsButtonListener(false);
            if (controlButtonPulseIntervalId) { clearInterval(controlButtonPulseIntervalId); controlButtonPulseIntervalId = null; }
        } catch(err) { logError('[DEACTIVATE] Error during cleanup:', err); }
        if (controlButton) { controlButton.disabled = false; delete controlButton.dataset.selfDisabled; }
        updateButtonAppearance();
    }

    function updateButtonAppearance() {
        if (!controlButton) return;

        if (isButtonIntegratedInHeader) {
            if (controlButtonPulseIntervalId) {
                clearInterval(controlButtonPulseIntervalId);
                controlButtonPulseIntervalId = null;
            }
            controlButton.style.boxShadow = 'none';
            controlButton.style.background = 'transparent';

            if (isScriptActive) {
                controlButton.innerHTML = eyeOnIconSVG;
                controlButton.title = 'Card Info: ON (Press to deactivate)';
                controlButton.style.color = `var(${CONFIG.CSS_VAR_ICON_ACTIVE_COLOR}, #28a745)`;
            } else {
                controlButton.innerHTML = eyeOffIconSVG;
                controlButton.title = 'Card Info: OFF (Press to activate)';
                // Use inactive color, which defaults to header text color
                controlButton.style.color = `var(${CONFIG.CSS_VAR_ICON_INACTIVE_COLOR}, var(${CONFIG.CSS_VAR_HEADER_TEXT_COLOR}, #757575))`;
            }
        } else { // Fallback: Floating button
            if (controlButtonPulseIntervalId) {
                clearInterval(controlButtonPulseIntervalId);
                controlButtonPulseIntervalId = null;
            }
            controlButton.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
            if (isScriptActive) {
                controlButton.innerHTML = `${eyeOnIconSVG} Info: ON`;
                controlButton.style.background = 'linear-gradient(135deg, #28a745 0%, #218838 100%)';
                controlButton.style.color = 'white';
                let pulseOut = true;
                controlButtonPulseIntervalId = setInterval(() => {
                    if (!isScriptActive || !controlButton || isButtonIntegratedInHeader) {
                        if (controlButtonPulseIntervalId) clearInterval(controlButtonPulseIntervalId);
                        controlButtonPulseIntervalId = null;
                        if (controlButton && !isButtonIntegratedInHeader) controlButton.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
                        return;
                    }
                    controlButton.style.boxShadow = pulseOut ? '0 6px 14px rgba(33, 136, 56, 0.5), 0 0 0 2px rgba(40, 167, 69, 0.3)' : '0 4px 8px rgba(0, 0, 0, 0.2)';
                    pulseOut = !pulseOut;
                }, 800);
            } else {
                controlButton.innerHTML = `${eyeOffIconSVG} Info: OFF`;
                controlButton.style.background = 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)';
                controlButton.style.color = 'white';
            }
        }
    }

    function createControlButton() {
        let existingButton = document.getElementById(CONFIG.CONTROL_BUTTON_ID);
        if (existingButton) {
            controlButton = existingButton;
        } else {
            controlButton = document.createElement('div');
            controlButton.id = CONFIG.CONTROL_BUTTON_ID;
        }

        const headerElement = document.querySelector(CONFIG.HEADER_SELECTOR);
        const referenceElementForInsertion = headerElement ? headerElement.querySelector(CONFIG.HEADER_GROUP_MENU_SELECTOR) : null;

        if (headerElement && referenceElementForInsertion) {
            isButtonIntegratedInHeader = true;
            controlButton.className = `${CONFIG.BUTTON_PI_CENTER_CLASS} ${CONFIG.BUTTON_INTEGRATED_CLASS}`;

            Object.assign(controlButton.style, {
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0px 8px', // !!! ADJUST PADDING TO MATCH SIBLING ICONS !!!
                margin: '0 10px',   // !!! ADJUST MARGINS FOR SPACING !!!
                background: 'transparent',
                border: 'none',
                // height: '30px', // Example: uncomment and set if other icons have fixed height
            });
            headerElement.insertBefore(controlButton, referenceElementForInsertion);
            logInfo('Control button integrated into header.');
        } else {
            isButtonIntegratedInHeader = false;
            logError('Header elements for integration not found. Using fallback floating button.');
            controlButton.className = '';
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
            catch(e) { logError("Failed to append control button to body:", e); return; }
        }

        // updateButtonAppearance called in initialSetup after this, or by activate/deactivate

        if (!controlButton.dataset.listenerAttached) {
            controlButton.addEventListener('click', () => {
                if (controlButton.disabled && controlButton.dataset.selfDisabled === 'true') { return; }
                controlButton.disabled = true; controlButton.dataset.selfDisabled = 'true';
                if (isScriptActive) { deactivateScriptFeatures(); } else { activateScriptFeatures(); }
            });

            if (!isButtonIntegratedInHeader) {
                controlButton.addEventListener('mouseenter', () => {
                    if (!controlButton.disabled) {
                        controlButton.style.transform = 'translateY(-2px)';
                        controlButton.style.boxShadow = isScriptActive ? '0 8px 18px rgba(33, 136, 56, 0.6)' : '0 8px 18px rgba(200, 35, 51, 0.6)';
                    }
                });
                controlButton.addEventListener('mouseleave', () => {
                    if (!controlButton.disabled) {
                        controlButton.style.transform = 'translateY(0)';
                        if (!isScriptActive || !controlButtonPulseIntervalId) { // Check pulse ID here
                            controlButton.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
                        }
                    }
                });
                controlButton.addEventListener('mousedown', () => { if (!controlButton.disabled) controlButton.style.transform = 'translateY(0px) scale(0.97)'; });
                controlButton.addEventListener('mouseup', () => { if (!controlButton.disabled) controlButton.style.transform = controlButton.matches(':hover') ? 'translateY(-2px)' : 'translateY(0)'; });
            }
            controlButton.dataset.listenerAttached = 'true';
        }
    }

    function initialSetup() {
        logInfo('[INIT] initialSetup called.');
        loadState();
        createControlButton();
        manageFeatureStyles(); // Setup initial styles (like CSS vars)
        updateButtonAppearance(); // Set initial button appearance after creation and styling setup

        if (isScriptActive) {
            logInfo('[INIT] Script is active, calling activateScriptFeatures with delay.');
            setTimeout(activateScriptFeatures, 500); // activateScriptFeatures will also call manageFeatureStyles and updateButtonAppearance
        } else {
            logInfo('Script starts in DEACTIVATED state as per saved preference.');
            // updateButtonAppearance(); // Already called above
        }
    }

    try {
        if (document.readyState === 'loading') { window.addEventListener('DOMContentLoaded', initialSetup); }
        else { initialSetup(); }
    } catch(e) { console.error("[Cards Info Script] Critical error during initial event listener setup:", e); }

})();
