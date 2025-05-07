// ==UserScript==
// @name         Auto Refresh and Donate (Futuristic & Animated)
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  Автоматизація донатів з перевіркою наявності кнопки, відключення звука та футуристичним анімованим інтерфейсом
// @author       Kavernatiastasi (Assisted by AI & Community)
// @match        https://asstars.tv/clubs/287/boost/
// @match        https://astars.club/clubs/287/boost/
// @match        https://animestars.org/clubs/287/boost/
// @match        https://as1.astars.club/clubs/287/boost/
// @match        https://asstars1.astars.club/clubs/287/boost/
// @grant        none
// @updateURL    https://raw.githubusercontent.com/iStormSpirit/astars_scripts/master/Auto_refresh_and_donate_animated.user.js
// @downloadURL  https://raw.githubusercontent.com/iStormSpirit/astars_scripts/master/Auto_refresh_and_donate_animated.user.js
// ==/UserScript==

(function () {
    'use strict';

    // --- Configuration for Timings (ВАЖЛИВО: налаштуйте ці значення!) ---
    const MAIN_INTERVAL_MS = 800;
    const DELAY_FOR_CHECK_AFTER_REFRESH_MS = 400;
    // --- Кінець конфігурації ---

    let isActivated = false;
    let mainIntervalId = null;
    let pulseIntervalId = null; // Для анімації пульсації

    const button = document.createElement('button');
    document.body.appendChild(button);

    // Стилі кнопки
    Object.assign(button.style, {
        position: 'fixed',
        top: '30px', // Трохи нижче
        left: '30px', // Трохи правіше
        zIndex: '10000', // Вищий z-index
        padding: '12px 20px',
        fontSize: '16px',
        color: 'white',
        border: 'none',
        borderRadius: '50px', // Овальна форма
        cursor: 'pointer',
        fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        boxShadow: '0 6px 12px rgba(0, 0, 0, 0.2), 0 0 0 0 rgba(52, 152, 219, 0.0)', // Початкова тінь для пульсації
        transition: 'all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)', // Плавніший перехід для всього
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px', // Відстань між іконкою та текстом
        minWidth: '200px', // Мінімальна ширина
        fontWeight: '500',
    });

    // SVG Іконки
    const playIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
    const stopIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>`;

    const setStartButtonStyle = () => {
        button.innerHTML = `${playIconSVG} Старт`;
        button.style.background = 'linear-gradient(135deg, #3498db 0%, #2980b9 100%)'; // Синій градієнт
        button.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.2)';
        if (pulseIntervalId) {
            clearInterval(pulseIntervalId);
            pulseIntervalId = null;
        }
    };

    const setStopButtonStyle = () => {
        button.innerHTML = `${stopIconSVG} Стоп`;
        button.style.background = 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)'; // Червоний градієнт

        // Анімація пульсації для активного стану
        let pulseOut = true;
        if (pulseIntervalId) clearInterval(pulseIntervalId); // Очистити попередній інтервал, якщо є
        pulseIntervalId = setInterval(() => {
            if (pulseOut) {
                button.style.boxShadow = `0 8px 20px rgba(0,0,0,0.3), 0 0 0 10px rgba(231, 76, 60, 0.3), 0 0 0 0 rgba(231, 76, 60, 0.1)`;
            } else {
                button.style.boxShadow = `0 6px 12px rgba(0,0,0,0.2), 0 0 0 0 rgba(231, 76, 60, 0.3), 0 0 0 0 rgba(231, 76, 60, 0.1)`;
            }
            pulseOut = !pulseOut;
        }, 1000); // Швидкість пульсації
    };

    setStartButtonStyle(); // Початковий стиль

    // Ефекти при наведенні
    button.addEventListener('mouseenter', () => {
        button.style.transform = 'translateY(-3px) scale(1.03)'; // Підняття та легке збільшення
        if (isActivated) {
            button.style.background = 'linear-gradient(135deg, #c0392b 0%, #a93226 100%)'; // Темніший червоний
        } else {
            button.style.background = 'linear-gradient(135deg, #2980b9 0%, #1f638b 100%)'; // Темніший синій
        }
    });

    button.addEventListener('mouseleave', () => {
        button.style.transform = 'translateY(0) scale(1)';
        if (isActivated) {
            // Повертаємо градієнт, але не перезапускаємо пульсацію тут,
            // вона вже керується setStopButtonStyle та clearInterval
            button.style.background = 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)';
        } else {
            setStartButtonStyle(); // Це також очистить pulseIntervalId, якщо він був випадково встановлений
        }
    });

    button.addEventListener('mousedown', () => {
        button.style.transform = 'translateY(1px) scale(0.97)';
        button.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.2)'; // Менша тінь при натисканні
    });

    button.addEventListener('mouseup', () => {
        button.style.transform = 'translateY(-3px) scale(1.03)'; // Повернення до стану наведення
         // Відновлюємо тінь відповідно до стану (пульсуючу або звичайну)
        if (isActivated) {
            // Не потрібно нічого робити з boxShadow тут, бо pulseIntervalId ним керує
        } else {
            button.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.2)';
        }
    });

    button.addEventListener('click', () => {
        isActivated = !isActivated;
        if (isActivated) {
            console.log(`[${new Date().toLocaleTimeString()}] Auto Donate Activated. Main interval: ${MAIN_INTERVAL_MS / 1000}s, Delay for check: ${DELAY_FOR_CHECK_AFTER_REFRESH_MS / 1000}s.`);
            setStopButtonStyle();
            startMainLoop();
        } else {
            console.log(`[${new Date().toLocaleTimeString()}] Auto Donate Deactivated.`);
            setStartButtonStyle(); // Це зупинить пульсацію
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
        const donateButton = document.querySelector('button.club__boost-btn');
        if (donateButton) {
            donateButton.click();
            console.log(`[${new Date().toLocaleTimeString()}] Donate button clicked.`);
        } else {
            console.log(`[${new Date().toLocaleTimeString()}] Donate button somehow not found before click, though it was checked.`);
        }
    }

    if (window.Audio) {
        Audio.prototype.play = function() {
            // console.log('Audio.play() called, but sound is muted by script.');
            return Promise.resolve(); // Повертаємо успішний проміс, щоб не викликати помилок
        };
    }

    function performActions() {
        if (!isActivated) {
            stopMainLoop();
            return;
        }

        console.log(`[${new Date().toLocaleTimeString()}] Starting refresh...`);
        refreshCard();

        setTimeout(() => {
            if (!isActivated) return;

            console.log(`[${new Date().toLocaleTimeString()}] Checking for donate button availability...`);
            const donateButton = document.querySelector('button.club__boost-btn');

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
            }
        }, DELAY_FOR_CHECK_AFTER_REFRESH_MS);
    }

    function startMainLoop() {
        if (mainIntervalId) {
            return;
        }
        performActions();
        mainIntervalId = setInterval(performActions, MAIN_INTERVAL_MS);
        console.log(`[${new Date().toLocaleTimeString()}] Main loop started. Interval ID: ${mainIntervalId}`);
    }

    function stopMainLoop() {
        if (mainIntervalId) {
            clearInterval(mainIntervalId);
            mainIntervalId = null;
            console.log(`[${new Date().toLocaleTimeString()}] Main loop stopped.`);
        }
        // Важливо також зупинити анімацію пульсації, якщо цикл зупинено не через клік по кнопці
        if (pulseIntervalId && !isActivated) { // Якщо цикл зупинено, а кнопка не в стані "Stop"
             clearInterval(pulseIntervalId);
             pulseIntervalId = null;
             // Повертаємо стиль кнопки до "Start", якщо вона ще не в цьому стані
             // Це може бути надлишковим, якщо stopMainLoop викликається тільки після setStartButtonStyle
             button.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.2)';
        }
    }
})();