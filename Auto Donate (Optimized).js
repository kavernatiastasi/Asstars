// ==UserScript==
// @name         Auto Refresh and Donate (Optimized)
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Автоматизація донатів з перевіркою наявності кнопки, відключення звука
// @author       Mainettant (Assisted by AI)
// @match        https://asstars.tv/clubs/287/boost/
// @match        https://astars.club/clubs/287/boost/
// @match        https://animestars.org/clubs/287/boost/
// @match        https://as1.astars.club/clubs/287/boost/
// @match        https://asstars1.astars.club/clubs/287/boost/
// @grant        none
// @updateURL    https://raw.githubusercontent.com/iStormSpirit/astars_scripts/master/Auto_refresh_and_donate.user.js
// @downloadURL  https://raw.githubusercontent.com/iStormSpirit/astars_scripts/master/Auto_refresh_and_donate.user.js
// ==/UserScript==

(function () {
    'use strict';

    // --- Configuration for Timings (ВАЖЛИВО: налаштуйте ці значення!) ---
    // Основний інтервал для спроби оновлення (в мілісекундах)
    // "Кожні кілька секунд". ПОПЕРЕДЖЕННЯ: Дуже короткі інтервали (менше 5-7 секунд) можуть бути ризикованими!
    const MAIN_INTERVAL_MS = 800; // За замовчуванням: 7 секунд. ОБЕРЕЖНО НАЛАШТУЙТЕ!

    // Затримка після кліку на "Оновити" перед перевіркою наявності кнопки "Донат" (в мілісекундах)
    // Має бути достатньою, щоб сторінка встигла візуально оновитися.
    const DELAY_FOR_CHECK_AFTER_REFRESH_MS = 400; // За замовчуванням: 2 секунди. ОБЕРЕЖНО НАЛАШТУЙТЕ!
    // --- Кінець конфігурації ---

    let isActivated = false;
    let mainIntervalId = null;

    const button = document.createElement('button');
    button.innerText = 'Start Auto Donate';
    button.style.position = 'fixed';
    button.style.top = '20px';
    button.style.left = '20px';
    button.style.zIndex = '1000';
    button.style.padding = '10px';
    button.style.backgroundColor = '#4CAF50';
    button.style.color = 'white';
    button.style.border = 'none';
    button.style.borderRadius = '5px';
    button.style.fontSize = '16px';
    button.style.cursor = 'pointer';

    document.body.appendChild(button);

    button.addEventListener('click', () => {
        isActivated = !isActivated;
        if (isActivated) {
            console.log(`[${new Date().toLocaleTimeString()}] Auto Donate Activated. Main interval: ${MAIN_INTERVAL_MS / 1000}s, Delay for check: ${DELAY_FOR_CHECK_AFTER_REFRESH_MS / 1000}s.`);
            button.innerText = 'Stop Auto Donate';
            button.style.backgroundColor = '#FF5733';
            startMainLoop();
        } else {
            console.log(`[${new Date().toLocaleTimeString()}] Auto Donate Deactivated.`);
            button.innerText = 'Start Auto Donate';
            button.style.backgroundColor = '#4CAF50';
            stopMainLoop();
        }
    });

    function refreshCard() {
        const refreshButton = document.querySelector('button.club__boost__refresh-btn');
        if (refreshButton) {
            refreshButton.click();
            console.log(`[${new Date().toLocaleTimeString()}] Refresh button clicked.`);
        } else {
            console.log(`[${new Date().toLocaleTimeString()}] Refresh button not found.`);
        }
    }

    function donateCard() {
        // Функція donateCard тепер викликається тільки якщо кнопка точно є
        const donateButton = document.querySelector('button.club__boost-btn');
        if (donateButton) { // Додаткова перевірка, хоча вона вже мала б бути
            donateButton.click();
            console.log(`[${new Date().toLocaleTimeString()}] Donate button clicked.`);
        } else {
            // Цей лог малоймовірний, якщо логіка в performActions правильна
            console.log(`[${new Date().toLocaleTimeString()}] Donate button somehow not found before click, though it was checked.`);
        }
    }

    if (window.Audio) {
        Audio.prototype.play = function() {
            console.log('Audio.play() called, but sound is muted by script.');
            return new Promise(() => {});
        };
    }

    function performActions() {
        if (!isActivated) {
            stopMainLoop();
            return;
        }

        console.log(`[${new Date().toLocaleTimeString()}] Starting refresh...`);
        refreshCard(); // Натискаємо "Оновити"

        // Чекаємо, щоб сторінка оновилася
        setTimeout(() => {
            if (!isActivated) return; // Перевіряємо ще раз, раптом користувач вимкнув

            console.log(`[${new Date().toLocaleTimeString()}] Checking for donate button availability...`);
            const donateButton = document.querySelector('button.club__boost-btn');

            // Перевіряємо, чи кнопка існує, видима (offsetParent !== null) та активна (!disabled)
            if (donateButton && donateButton.offsetParent !== null && !donateButton.disabled) {
                console.log(`[${new Date().toLocaleTimeString()}] Donate button found and seems active. Attempting donate action...`);
                donateCard();
            } else {
                if (!donateButton) {
                    console.log(`[${new Date().toLocaleTimeString()}] Donate button (button.club__boost-btn) not found after refresh.`);
                } else if (donateButton.offsetParent === null) {
                    console.log(`[${new Date().toLocaleTimeString()}] Donate button found, but it is not visible.`);
                } else if (donateButton.disabled) {
                    console.log(`[${new Date().toLocaleTimeString()}] Donate button found, but it is disabled.`);
                }
                // Якщо кнопки немає або вона не активна, нічого не робимо, чекаємо наступного циклу
            }
        }, DELAY_FOR_CHECK_AFTER_REFRESH_MS);
    }

    function startMainLoop() {
        if (mainIntervalId) {
            return;
        }
        performActions(); // Виконати одразу при старті
        mainIntervalId = setInterval(performActions, MAIN_INTERVAL_MS);
        console.log(`[${new Date().toLocaleTimeString()}] Main loop started. Interval ID: ${mainIntervalId}`);
    }

    function stopMainLoop() {
        if (mainIntervalId) {
            clearInterval(mainIntervalId);
            mainIntervalId = null;
            console.log(`[${new Date().toLocaleTimeString()}] Main loop stopped.`);
        }
    }
})();