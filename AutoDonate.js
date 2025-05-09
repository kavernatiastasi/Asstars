// ==UserScript==
// @name         Auto Refresh and Donate (v1.6 - Blocked Card Check)
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  Автоматизація донатів з перевіркою наявності кнопки та заблокованої картки, відключення звука.
// @author       Kavernatiastasi (Assisted by AI & Community)
// @match        https://asstars.tv/clubs/287/boost/
// @match        https://astars.club/clubs/287/boost/
// @match        https://animestars.org/clubs/287/boost/
// @match        https://as1.astars.club/clubs/287/boost/
// @match        https://asstars1.astars.club/clubs/287/boost/
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // --- Configuration ---
    const CONFIG = {
        MAIN_INTERVAL_MS: 600,  // Основний інтервал оновлення
        DELAY_FOR_CHECK_AFTER_REFRESH_MS: 200, // Затримка перевірки кнопки Донат після Оновити
        DELAY_AFTER_DONATE_CLICK_CHECK_MS: 500, // Затримка перевірки попапу ПІСЛЯ кліку на Донат
        // Селектори
        REFRESH_BUTTON_SELECTOR: 'button.club__boost__refresh-btn',
        DONATE_BUTTON_SELECTOR: 'button.club__boost-btn',
        // Селектори та текст для попапу про заблоковану картку
        BLOCKED_CARD_POPUP_CONTENT_SELECTOR: ".DLEPush-message", // Селектор для тексту в попапі
        BLOCKED_CARD_POPUP_TEXT: "Ваша карта заблокирована",    // Частина тексту для пошуку
        BLOCKED_CARD_POPUP_CLOSE_SELECTOR: ".DLEPush-close",     // Селектор кнопки закриття цього попапу
        // Інше
        DEBUG_LOGS: false // Ввімкнути для діагностики
    };

    let isActivated = false;
    let mainIntervalId = null;
    let pulseIntervalId = null;
    let donationBlockedThisCycle = false; // Прапорець блокування в поточному циклі

    // Логування
    function log(message, type = "info") {
        if (!CONFIG.DEBUG_LOGS && type === "debug") return;
        const prefix = "[AutoDonate]";
        const time = `[${new Date().toLocaleTimeString()}]`;
        if (type === "error") console.error(prefix, time, message);
        else if (type === "warn") console.warn(prefix, time, message);
        else console.log(prefix, time, message);
    }

    // --- Кнопка керування (без змін від v1.5) ---
    const button = document.createElement('button');
    document.body.appendChild(button);
    Object.assign(button.style, { /* ... стилі кнопки ... */
        position: 'fixed', top: '65px', left: '30px', zIndex: '10000',
        padding: '12px 20px', fontSize: '16px', color: 'white', border: 'none',
        borderRadius: '50px', cursor: 'pointer', fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        boxShadow: '0 6px 12px rgba(0, 0, 0, 0.2), 0 0 0 0 rgba(52, 152, 219, 0.0)',
        transition: 'all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', gap: '10px',
        minWidth: '200px', fontWeight: '500',
    });
    const playIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
    const stopIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>`;
    const setStartButtonStyle = () => { /* ... */
        button.innerHTML = `${playIconSVG} Старт`;
        button.style.background = 'linear-gradient(135deg, #3498db 0%, #2980b9 100%)';
        button.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.2)';
        if (pulseIntervalId) { clearInterval(pulseIntervalId); pulseIntervalId = null; }
    };
    const setStopButtonStyle = () => { /* ... */
        button.innerHTML = `${stopIconSVG} Стоп`;
        button.style.background = 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)';
        let pulseOut = true;
        if (pulseIntervalId) clearInterval(pulseIntervalId);
        pulseIntervalId = setInterval(() => {
            if (!isActivated) { // Зупинити, якщо скрипт вимкнено
                 clearInterval(pulseIntervalId); pulseIntervalId = null;
                 button.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.2)'; // Скинути тінь
                 return;
            }
            if (pulseOut) button.style.boxShadow = `0 8px 20px rgba(0,0,0,0.3), 0 0 0 10px rgba(231, 76, 60, 0.3), 0 0 0 0 rgba(231, 76, 60, 0.1)`;
            else button.style.boxShadow = `0 6px 12px rgba(0,0,0,0.2), 0 0 0 0 rgba(231, 76, 60, 0.3), 0 0 0 0 rgba(231, 76, 60, 0.1)`;
            pulseOut = !pulseOut;
        }, 1000);
    };
    setStartButtonStyle();
    button.addEventListener('mouseenter', () => { /* ... */
         button.style.transform = 'translateY(-3px) scale(1.03)';
        if (isActivated) button.style.background = 'linear-gradient(135deg, #c0392b 0%, #a93226 100%)';
        else button.style.background = 'linear-gradient(135deg, #2980b9 0%, #1f638b 100%)';
    });
    button.addEventListener('mouseleave', () => { /* ... */
        button.style.transform = 'translateY(0) scale(1)';
        if (isActivated) button.style.background = 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)';
        else setStartButtonStyle();
     });
    button.addEventListener('mousedown', () => { /* ... */
        button.style.transform = 'translateY(1px) scale(0.97)';
        button.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.2)';
     });
    button.addEventListener('mouseup', () => { /* ... */
        button.style.transform = button.matches(':hover') ? 'translateY(-3px) scale(1.03)' : 'translateY(0) scale(1)';
         if (!isActivated || !pulseIntervalId) { // Відновити тінь, якщо неактивний або немає пульсації
              button.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.2)';
         }
     });
    button.addEventListener('click', () => { /* ... */
        isActivated = !isActivated;
        if (isActivated) {
            log(`Auto Donate Activated. Interval: ${CONFIG.MAIN_INTERVAL_MS / 1000}s`);
            setStopButtonStyle();
            startMainLoop();
        } else {
            log(`Auto Donate Deactivated.`);
            setStartButtonStyle();
            stopMainLoop();
        }
    });
    // --- Кінець блоку кнопки ---

    function refreshCard() {
        try {
            const refreshButton = document.querySelector(CONFIG.REFRESH_BUTTON_SELECTOR);
            if (refreshButton) {
                refreshButton.click();
                log("Refresh button clicked.", "debug");
            } else {
                log("Refresh button not found.", "warn");
            }
        } catch(e) { log("Error clicking refresh: " + e.message, "error"); }
    }

    function donateCard() {
        try {
            const donateButton = document.querySelector(CONFIG.DONATE_BUTTON_SELECTOR);
            if (donateButton) {
                donateButton.click();
                log("Donate button clicked.", "info");
            } else {
                log("Donate button not found right before click (should not happen often).", "warn");
            }
        } catch (e) { log("Error clicking donate: " + e.message, "error"); }
    }

    // --- Нова функція для перевірки попапу після кліку на донат ---
    function checkForBlockedCardPopup() {
        if (!isActivated) return; // Перевірка стану
        try {
            const popupContents = document.querySelectorAll(CONFIG.BLOCKED_CARD_POPUP_CONTENT_SELECTOR);
            let foundBlockedPopup = false;

            for (const contentElement of popupContents) {
                if (contentElement.offsetParent !== null && contentElement.textContent.includes(CONFIG.BLOCKED_CARD_POPUP_TEXT)) {
                    log("Detected 'Card Blocked' popup.", "warn");
                    donationBlockedThisCycle = true; // Встановлюємо прапорець
                    foundBlockedPopup = true;

                    // Шукаємо кнопку закриття В ЦЬОМУ ж попапі
                    const notificationWrapper = contentElement.closest('.DLEPush-notification'); // DLE specific?
                    if (notificationWrapper) {
                        const closeButton = notificationWrapper.querySelector(CONFIG.BLOCKED_CARD_POPUP_CLOSE_SELECTOR);
                        if (closeButton && closeButton.offsetParent !== null) {
                            log("Closing 'Card Blocked' popup.", "info");
                            closeButton.click();
                        } else {
                             log("Could not find/click close button for 'Card Blocked' popup.", "warn");
                        }
                    } else {
                        log("Could not find notification wrapper to find close button.", "warn");
                    }
                    break; // Знайшли потрібний попап, виходимо з циклу
                }
            }
            // if (foundBlockedPopup) {
            //     log("Donation attempt was blocked by site.", "info");
            // } else {
            //     log("No 'Card Blocked' popup detected after donate attempt.", "debug");
            // }
        } catch(e) {
            log("Error in checkForBlockedCardPopup: " + e.message, "error");
        }
    }


    // --- Заглушка звуку (без змін) ---
    if (window.Audio) {
        Audio.prototype.play = function() {
            return Promise.resolve();
        };
    }

    // --- Основний цикл (оновлено) ---
    function performActions() {
        if (!isActivated) {
            stopMainLoop();
            return;
        }

        donationBlockedThisCycle = false; // <<< Скидаємо прапорець на початку кожного циклу

        log("Starting refresh...", "debug");
        refreshCard();

        setTimeout(() => {
            if (!isActivated) return;

            log("Checking for donate button availability...", "debug");
            const donateButton = document.querySelector(CONFIG.DONATE_BUTTON_SELECTOR);

            // <<< Додано перевірку !donationBlockedThisCycle >>>
            if (donateButton && donateButton.offsetParent !== null && !donateButton.disabled && !donationBlockedThisCycle) {
                log("Donate button found, active, and not blocked this cycle. Attempting donate action...");
                donateCard(); // Натискаємо "Донат"

                // <<< Запускаємо перевірку на попап ПІСЛЯ спроби донату >>>
                setTimeout(checkForBlockedCardPopup, CONFIG.DELAY_AFTER_DONATE_CLICK_CHECK_MS);

            } else {
                // Логування причин, чому не клікнули
                if (!donateButton) {
                    log("Donate button not found after refresh.", "debug");
                } else if (donateButton.offsetParent === null) {
                    log("Donate button found, but it is not visible.", "debug");
                } else if (donateButton.disabled) {
                    log("Donate button found, but it is disabled.", "debug");
                } else if (donationBlockedThisCycle) {
                    // Повідомлення вже було виведено в checkForBlockedCardPopup
                    log("Donation blocked by popup this cycle. Waiting for next refresh.", "debug");
                }
            }
        }, CONFIG.DELAY_FOR_CHECK_AFTER_REFRESH_MS);
    }

    function startMainLoop() {
        if (mainIntervalId) return;
        performActions(); // Виконати одразу
        mainIntervalId = setInterval(performActions, CONFIG.MAIN_INTERVAL_MS);
        log(`Main loop started. Interval ID: ${mainIntervalId}`);
    }

    function stopMainLoop() {
        if (mainIntervalId) {
            clearInterval(mainIntervalId);
            mainIntervalId = null;
            log(`Main loop stopped.`);
        }
        if (pulseIntervalId) { // Зупиняємо пульсацію кнопки при зупинці циклу
             clearInterval(pulseIntervalId);
             pulseIntervalId = null;
             // Якщо кнопка ще існує, скидаємо тінь
             if(controlButton) {
                 button.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.2)';
             }
        }
    }

    // Запуск скрипта при завантаженні сторінки
     if (document.readyState === 'loading') {
         window.addEventListener('DOMContentLoaded', setStartButtonStyle); // Встановити стиль кнопки після завантаження DOM
     } else {
         setStartButtonStyle(); // Встановити стиль кнопки одразу
     }

})(); // Кінець скрипта
