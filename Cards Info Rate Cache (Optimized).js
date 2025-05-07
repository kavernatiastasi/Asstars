// ==UserScript==
// @name         Cards Info Rate Cache (Optimized v1.1.1)
// @namespace    http://tampermonkey.net/
// @version      1.1.1
// @description  Оптимізована інформація про карти, need / trade / want list з кешуванням
// @author       Mainettant (Assisted by AI)
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
        CACHE_EXPIRY_DATA_MS: 3600 * 1000, // 1 година для даних карток
        CACHE_EXPIRY_WANT_LIST_MS: 900 * 1000, // 15 хвилин для списку бажаного
        DEFAULT_BATCH_SIZE: 14,
        LOOTBOX_BATCH_SIZE: 3,
        DELAY_NORMAL_MS: 2500, // Затримка для звичайних списків карток
        DELAY_FAST_MS: 100,    // Затримка для швидких оновлень (лутбокси, повні сторінки)
        BASE_URL_SELECTOR: 'link[rel="preconnect"]', // !!! ПЕРЕВІРТЕ ЦЕЙ СЕЛЕКТОР !!!
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
        PAGINATION_BUTTON_SELECTOR: '.pagination__pages-btn a', // !!! ПЕРЕВІРТЕ ЦЕЙ СЕЛЕКТОР !!! (для пагінації)
        PROFILE_FRIENDS_SELECTOR: '.profile__friends a', // !!! ПЕРЕВІРТЕ ЦЕЙ СЕЛЕКТОР !!! (для підрахунку користувачів)
        DARK_THEME_CLASS: 'dark-theme',
        INFO_CONTAINER_CLASS: 'card-stats-info-container',
        WANTED_BY_USER_CLASS: 'anime-cards__wanted-by-user',
        CACHE_PREFIX_DATA: 'cardData-',
        CACHE_KEY_WANT_LIST: 'currentUserWantList',
    };

    let baseUrl = "";
    let ongoingRequests = {};

    function logError(...args) {
        console.error('[Cards Info Script]', ...args);
    }

    function logInfo(...args) {
        console.log('[Cards Info Script]', ...args);
    }

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function saveToCache(key, data, expiryMs) {
        try {
            const item = { timestamp: Date.now(), data: data };
            localStorage.setItem(key, JSON.stringify(item));
            if (expiryMs) {
                setTimeout(() => { localStorage.removeItem(key); }, expiryMs);
            }
        } catch (error) {
            logError('Error saving to cache:', key, error);
        }
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
                if (baseUrl && !baseUrl.endsWith('/')) {
                    baseUrl += '/';
                }
                logInfo('Base URL determined:', baseUrl);
            }
            if (!baseUrl) {
                logError('Base URL could not be determined. Script might not work correctly. Please check CONFIG.BASE_URL_SELECTOR');
            }
        } catch (error) {
            logError('Error initializing base URL:', error);
        }
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
        if (needCount === 0 && tradeCount === 0) return '#f0f0f0';
        if (needCount >= tradeCount * 2) return '#1DD300';
        if (tradeCount < needCount && needCount < tradeCount * 2) return '#7AE969';
        if (tradeCount * 0.75 <= needCount && needCount < tradeCount) return '#FFFF00';
        if (tradeCount * 0.5 <= needCount && needCount < tradeCount * 0.75) return '#FF4040';
        if (needCount * 2 < tradeCount) return '#A60000';
        return '#f0f0f0';
    }

    function isDarkThemeActive() {
        return document.body.classList.contains(CONFIG.DARK_THEME_CLASS);
    }

    function getTextForegroundColor() {
        return isDarkThemeActive() ? '#ffffff' : '#000000';
    }

    function updateTextColorForThemeChange() {
        const newColor = getTextForegroundColor();
        document.querySelectorAll(`.${CONFIG.INFO_CONTAINER_CLASS} div`).forEach(div => {
            div.style.color = newColor;
        });
    }

    function observeThemeChanges() {
        const themeObserver = new MutationObserver(mutationsList => {
            for (const mutation of mutationsList) {
                if (mutation.attributeName === 'class') {
                    updateTextColorForThemeChange();
                    break;
                }
            }
        });
        themeObserver.observe(document.body, { attributes: true });
    }

    async function fetchHttp(url) {
        if (ongoingRequests[url]) {
            return ongoingRequests[url];
        }
        ongoingRequests[url] = new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                onload: function (response) {
                    delete ongoingRequests[url];
                    if (response.status >= 200 && response.status < 300) {
                        resolve(response.responseText);
                    } else {
                        reject(new Error(`HTTP error ${response.status} for ${url}. Response: ${response.statusText}`));
                    }
                },
                onerror: function (error) {
                    delete ongoingRequests[url];
                    logError('GM_xmlhttpRequest error for:', url, error);
                    reject(error);
                },
                ontimeout: function () {
                    delete ongoingRequests[url];
                    logError('GM_xmlhttpRequest timeout for:', url);
                    reject(new Error(`Timeout for ${url}`));
                }
            });
        });
        return ongoingRequests[url];
    }

    async function fetchUserCount(dataUrl) { // dataUrl має бути АБСОЛЮТНОЮ URL
        const cacheKey = CONFIG.CACHE_PREFIX_DATA + dataUrl.replace(/[^a-zA-Z0-9]/g, '_');
        const cachedData = getFromCache(cacheKey, CONFIG.CACHE_EXPIRY_DATA_MS);
        if (cachedData !== null) {
            return cachedData;
        }

        let totalCount = 0;
        let currentPageUrl = dataUrl; // Починаємо з переданої URL

        try {
            while (currentPageUrl) {
                const htmlText = await fetchHttp(currentPageUrl);
                const parser = new DOMParser();
                const doc = parser.parseFromString(htmlText, 'text/html');
                
                totalCount += doc.querySelectorAll(CONFIG.PROFILE_FRIENDS_SELECTOR).length;

                const paginationButton = doc.querySelector(CONFIG.PAGINATION_BUTTON_SELECTOR);
                let nextHref = paginationButton ? paginationButton.getAttribute('href') : null;

                if (nextHref) {
                    if (nextHref.startsWith('http')) {
                        currentPageUrl = nextHref; // Вже абсолютна
                    } else {
                        // Відносна URL, будуємо з глобальною baseUrl
                        if (!baseUrl) {
                            logError("Cannot construct pagination URL for fetchUserCount: global baseUrl is not set. Stopping pagination.");
                            currentPageUrl = null;
                        } else {
                            let B = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
                            let P = nextHref.startsWith('/') ? nextHref.slice(1) : nextHref;
                            currentPageUrl = `${B}/${P}`;
                        }
                    }
                } else {
                    currentPageUrl = null; // Немає кнопки пагінації / наступної сторінки
                }
            }
            saveToCache(cacheKey, totalCount, CONFIG.CACHE_EXPIRY_DATA_MS);
            return totalCount;
        } catch (error) {
            logError('Failed to fetch user count for:', dataUrl, error); // dataUrl тут - це початкова URL, передана в функцію
            return 0;
        }
    }

    async function displayCardStatistics(cardElementWrapper, cardId) {
        if (!baseUrl || !cardId) {
            if (!baseUrl) logError('displayCardStatistics cancelled: baseUrl is not set.');
            if (!cardId) logError('displayCardStatistics cancelled: cardId is not provided for element:', cardElementWrapper);
            return;
        }
        if (cardElementWrapper.querySelector(`.${CONFIG.INFO_CONTAINER_CLASS}`)) {
            return;
        }

        const needUrl = `${baseUrl}cards/${cardId}/users/need/`;
        const tradeUrl = `${baseUrl}cards/${cardId}/users/trade/`;

        try {
            const [needCount, tradeCount] = await Promise.all([
                fetchUserCount(needUrl),
                fetchUserCount(tradeUrl)
            ]);

            const { infoContainer, needContainer, tradeContainer } = createCardInfoElements();
            infoContainer.style.backgroundColor = getRatingColor(needCount, tradeCount);
            const textColor = getTextForegroundColor();
            needContainer.style.color = textColor;
            tradeContainer.style.color = textColor;
            needContainer.textContent = `Need: ${needCount}`;
            tradeContainer.textContent = `Trade: ${tradeCount}`;
            cardElementWrapper.appendChild(infoContainer);

            const wantList = getFromCache(CONFIG.CACHE_KEY_WANT_LIST, CONFIG.CACHE_EXPIRY_WANT_LIST_MS);
            if (wantList && wantList.includes(cardId)) {
                 cardElementWrapper.classList.add(CONFIG.WANTED_BY_USER_CLASS);
            }
        } catch (error) {
            logError('Error displaying card stats for cardId:', cardId, error);
        }
    }

    async function fetchUserWantList(userProfileBaseUrl) { // userProfileBaseUrl має бути АБСОЛЮТНОЮ URL до профілю
        logInfo('Fetching user want list...');
        const cachedWantList = getFromCache(CONFIG.CACHE_KEY_WANT_LIST, CONFIG.CACHE_EXPIRY_WANT_LIST_MS);
        if (cachedWantList) {
            logInfo('Want list loaded from cache.');
            return cachedWantList;
        }

        let wantList = [];
        // Початкова URL для першої сторінки списку бажаного
        let currentPageUrl = userProfileBaseUrl.endsWith('/') ? `${userProfileBaseUrl}cards/need/page/1/` : `${userProfileBaseUrl}/cards/need/page/1/`;


        try {
            while (currentPageUrl) {
                const htmlText = await fetchHttp(currentPageUrl);
                const parser = new DOMParser();
                const doc = parser.parseFromString(htmlText, 'text/html');
                
                doc.querySelectorAll(CONFIG.CARD_ITEM_SELECTOR).forEach(cardElement => {
                    const cardId = cardElement.getAttribute('data-id');
                    if (cardId) wantList.push(cardId);
                });

                const paginationButton = doc.querySelector(CONFIG.PAGINATION_BUTTON_SELECTOR);
                let nextHref = paginationButton ? paginationButton.getAttribute('href') : null;

                if (nextHref) {
                     if (nextHref.startsWith('http')) {
                        currentPageUrl = nextHref; // Вже абсолютна
                    } else {
                        // Відносна URL, будуємо з глобальною baseUrl (або можна з userProfileBaseUrl, якщо він завжди коректний)
                        // Краще використовувати baseUrl, якщо він визначений, для уніфікації
                        if (!baseUrl) { // Або можна використати тут userProfileBaseUrl, якщо він гарантовано абсолютний
                            logError("Cannot construct pagination URL for want list: global baseUrl is not set. Stopping pagination.");
                            currentPageUrl = null;
                        } else {
                            let B = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
                            let P = nextHref.startsWith('/') ? nextHref.slice(1) : nextHref;
                            currentPageUrl = `${B}/${P}`;
                        }
                    }
                } else {
                    currentPageUrl = null;
                }
            }
            saveToCache(CONFIG.CACHE_KEY_WANT_LIST, wantList, CONFIG.CACHE_EXPIRY_WANT_LIST_MS);
            logInfo('Want list fetched and cached:', wantList.length, 'cards.');
            return wantList;
        } catch (error) {
            logError('Failed to fetch user want list from:', userProfileBaseUrl, error);
            return [];
        }
    }

    async function processCardElements(selector, batchSize, delayMs, isTradeItem = false) {
        const cardElements = document.querySelectorAll(selector);
        if (cardElements.length === 0) return;

        logInfo(`Processing ${cardElements.length} elements with selector: ${selector}`);
        const promises = [];

        for (let i = 0; i < cardElements.length; i += batchSize) {
            const batch = Array.from(cardElements).slice(i, i + batchSize);
            for (const element of batch) {
                try {
                    let cardId;
                    let wrapperElement = element;

                    if (isTradeItem) {
                        const href = element.getAttribute('href');
                        if (href) {
                           const parts = href.split('/');
                           const cardsIndex = parts.indexOf('cards');
                           if (cardsIndex !== -1 && parts.length > cardsIndex + 1) {
                               cardId = parts[cardsIndex + 1];
                           }
                        }
                    } else {
                        const cardItem = element.matches(CONFIG.CARD_ITEM_SELECTOR) ? element : element.querySelector(CONFIG.CARD_ITEM_SELECTOR);
                        cardId = cardItem ? cardItem.getAttribute('data-id') : element.getAttribute('data-id');
                        if (!cardId && element.classList.contains('lootbox__card')) {
                            cardId = element.getAttribute('data-id');
                        }
                    }
                    
                    if (cardId) {
                         promises.push(displayCardStatistics(wrapperElement, cardId));
                    } else {
                        logInfo('Card ID not found for element:', element);
                    }
                } catch(e) {
                    logError('Error processing individual card element:', element, e)
                }
            }
            if (i + batchSize < cardElements.length) {
                await delay(delayMs);
            }
        }
        await Promise.all(promises); // Чекаємо завершення всіх displayCardStatistics для поточного набору сторінок
        logInfo(`Finished processing elements for selector: ${selector}`);
    }

    function setupAllCardsClickListener() {
        const allCardsButton = document.querySelector(CONFIG.SELECTORS_PAGES.allAnimeCardsButton);
        if (allCardsButton) {
            allCardsButton.addEventListener('click', async function (event) {
                logInfo('Clicked "All Anime Cards". Refreshing full page cards info...');
                await delay(200);
                await processCardElements(CONFIG.SELECTORS_PAGES.fullPageCards, CONFIG.DEFAULT_BATCH_SIZE, CONFIG.DELAY_FAST_MS);
            });
        }
    }

    async function main() {
        initializeBaseUrl(); // Дуже важливо, щоб це відпрацювало коректно
        // Невелика затримка, щоб дати сайту повністю проініціалізуватися, якщо потрібно
        await delay(200);


        if (!baseUrl) {
            logError('Script cannot run effectively without a base URL. Some functionalities will fail.');
            // Можна не зупиняти скрипт повністю, але попередити, що запити даних не працюватимуть
        }
        logInfo('Script started. Base URL (if determined):', baseUrl || 'Not determined');

        observeThemeChanges();

        const userAvatar = document.querySelector(CONFIG.USER_AVATAR_SELECTOR);
        const userName = userAvatar ? userAvatar.getAttribute('title') : null;

        if (userName && baseUrl) { // Потрібен baseUrl для формування userProfileUrl
            const userProfileUrl = `${baseUrl}user/${userName}/`;
            await fetchUserWantList(userProfileUrl);
        } else {
            if (!userName) logInfo('User avatar or name not found. Cannot fetch want list.');
            if (!baseUrl && userName) logInfo('Base URL not determined. Cannot fetch want list even if username is found.');
        }

        if (document.querySelector(CONFIG.SELECTORS_PAGES.generalCards)) {
           await processCardElements(CONFIG.SELECTORS_PAGES.generalCards, CONFIG.DEFAULT_BATCH_SIZE, CONFIG.DELAY_NORMAL_MS);
        }
        if (document.querySelector(CONFIG.SELECTORS_PAGES.fullPageCards)) {
            await processCardElements(CONFIG.SELECTORS_PAGES.fullPageCards, CONFIG.DEFAULT_BATCH_SIZE, CONFIG.DELAY_FAST_MS);
        }
        if (document.querySelector(CONFIG.SELECTORS_PAGES.tradeItems)) {
            await processCardElements(CONFIG.SELECTORS_PAGES.tradeItems, CONFIG.DEFAULT_BATCH_SIZE, CONFIG.DELAY_FAST_MS, true);
        }
        if (document.querySelector(CONFIG.SELECTORS_PAGES.lootboxList)) {
             await processCardElements(CONFIG.SELECTORS_PAGES.lootboxCards, CONFIG.LOOTBOX_BATCH_SIZE, CONFIG.DELAY_FAST_MS);
        }
       
        setupAllCardsClickListener();

        const styleElement = document.createElement('style');
        styleElement.textContent = `
            .${CONFIG.WANTED_BY_USER_CLASS} {
                border: 3px solid #1DD300 !important;
                border-radius: 7px;
                box-sizing: border-box;
            }
        `;
        document.head.appendChild(styleElement);
        updateTextColorForThemeChange();
        logInfo('Script initialization complete.');
    }

    window.addEventListener('load', main);

})();