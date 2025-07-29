// ============================================================================
// DK NEWS HUNTERS - Popup Script
// Логика пользовательского интерфейса и взаимодействие с background script
// ============================================================================

// ============================================================================
// КОНСТАНТЫ И ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ============================================================================

// Состояние системы
let selectedNews = null;
let selectedAsset = "";
let selectedPair = "";
let processedNews = {}; // Для отслеживания обработанных новостей
let tradingSystemActive = false; // Состояние торговой системы

// Торговые пары для UI
const PAIRS = {
  "AUD": ["EUR/AUD", "AUD/USD", "AUD/CHF", "AUD/CAD", "GBP/AUD", "AUD/JPY"],
  "GBP": ["GBP/CAD", "GBP/USD", "GBP/CHF", "GBP/JPY", "EUR/GBP", "GBP/AUD"],  
  "EUR": ["EUR/AUD", "EUR/USD", "EUR/JPY", "EUR/CAD", "EUR/CHF", "EUR/GBP"],
  "USD": ["EUR/USD", "AUD/USD", "USD/CAD", "GBP/USD", "USD/JPY", "USD/CHF"],
  "JPY": ["EUR/JPY", "USD/JPY", "CHF/JPY", "GBP/JPY", "AUD/JPY", "CAD/JPY"],
  "CHF": ["AUD/CHF", "GBP/CHF", "EUR/CHF", "CHF/JPY", "USD/CHF", "CAD/CHF"],
  "CAD": ["GBP/CAD", "EUR/CAD", "USD/CAD", "CAD/CHF", "AUD/CAD", "CAD/JPY"]
};

// URL для авторизации и проверки
const SERVER_URL = "http://176.108.253.203:8000/login";
const VERIFY_URL = "http://176.108.253.203:8000/verify";

// ============================================================================
// УТИЛИТАРНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Выполняет клик по элементу на активной вкладке
 * @param {string} selector - CSS селектор элемента
 * @returns {Promise<boolean>} - Успешность выполнения клика
 */
function clickElement(selector) {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) {
        console.error("No active tab found");
        resolve(false);
        return;
      }
      
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: (sel) => {
          const element = document.querySelector(sel);
          if (element) {
            const event = new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window
            });
            element.dispatchEvent(event);
            console.log("Successfully clicked:", sel);
            return true;
          } else {
            console.warn("Element not found:", sel);
            return false;
          }
        },
        args: [selector],
      }, (results) => {
        if (chrome.runtime.lastError) {
          console.error("Error executing script:", chrome.runtime.lastError);
          resolve(false);
        } else {
          resolve(results && results[0] && results[0].result);
        }
      });
    });
  });
}

/**
 * Определяет цвет для типа данных новости
 * @param {string} type - Тип данных (GFP, RFP, BFP, NFP)
 * @returns {string} - Цвет в формате CSS
 */
function getColorFromType(type) {
  switch (type) {
    case 'GFP': return 'green';
    case 'RFP': return 'red';
    case 'BFP': return 'black';
    default: return 'black';
  }
}

/**
 * Проверяет, была ли новость уже обработана
 * @param {Object} newsItem - Объект новости
 * @returns {boolean} - Статус обработки
 */
function isNewsProcessed(newsItem) {
  if (!newsItem) return true;
  const key = `${newsItem.event}_${newsItem.currency}_${newsItem.actual}`;
  return processedNews[key] || false;  
}

// ============================================================================
// ФУНКЦИИ ДЛЯ РАБОТЫ С BID И АВТОРИЗАЦИЕЙ
// ============================================================================

/**
 * Проверяет мета-данные сайта для определения брокерского ресурса
 * Выполняется в контексте веб-страницы
 * @returns {boolean} - true если сайт определен как брокерский
 */
function checkBrokerMeta() {
  try {
    // 1. Проверка специфичных мета-тегов брокера
    const themeColorMeta = document.querySelector('meta[name="theme-color"][content="#1F1F23"]');
    const colorSchemesMeta = document.querySelector('meta[name="supported-color-schemes"][content="light dark"]');
    if (themeColorMeta && colorSchemesMeta) {
      console.log('[DK] Найдены специфичные мета-теги брокера');
      return true;
    }
    
    // 2. Проверка Open Graph для брокера/торговли
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogSiteName = document.querySelector('meta[property="og:site_name"]');
    const ogDescription = document.querySelector('meta[property="og:description"]');
    
    if (ogTitle && (ogTitle.content.toLowerCase().includes('trading') || ogTitle.content.toLowerCase().includes('broker'))) {
      console.log('[DK] Найден брокерский сайт по og:title');
      return true;
    }
    
    if (ogSiteName && (ogSiteName.content.toLowerCase().includes('trading') || ogSiteName.content.toLowerCase().includes('broker'))) {
      console.log('[DK] Найден брокерский сайт по og:site_name');
      return true;
    }
    
    if (ogDescription && (ogDescription.content.toLowerCase().includes('trading') || ogDescription.content.toLowerCase().includes('broker'))) {
      console.log('[DK] Найден брокерский сайт по og:description');
      return true;
    }
    
    // 3. Проверка наличия элемента с BID (.info__id)
    const bidElement = document.querySelector('.info__id');
    if (bidElement) {
      console.log('[DK] Найден элемент с BID на странице');
      return true;
    }
    
    console.log('[DK] Сайт не определен как брокерский');
    return false;
  } catch (error) {
    console.error('[DK] Ошибка при проверке мета-данных:', error);
    return false;
  }
}

/**
 * Пытается получить BID из открытых вкладок брокера
 * @returns {Promise<string|null>} - BID или null при неудаче
 */
async function attemptGetBID() {
  return new Promise((resolve) => {
    chrome.tabs.query({ url: "*://*/*" }, async (tabs) => {
      console.log('[Popup] Проверка', tabs.length, 'вкладок на предмет брокерских сайтов');
      
      // Проверяем каждую вкладку с помощью функции checkBrokerMeta
      const brokerTabs = [];
      
      for (const tab of tabs) {
        // Пропускаем системные вкладки
        if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
          continue;
        }
        
        try {
          // Проверяем, является ли вкладка брокерским сайтом
          const results = await new Promise((tabResolve) => {
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: checkBrokerMeta
            }, (results) => {
              if (chrome.runtime.lastError) {
                console.log('[Popup] Не удалось проверить вкладку', tab.id, ':', chrome.runtime.lastError.message);
                tabResolve(false);
              } else if (results && results[0]) {
                tabResolve(results[0].result);
              } else {
                tabResolve(false);
              }
            });
          });
          
          if (results) {
            console.log('[Popup] Найден брокерский сайт на вкладке:', tab.url);
            brokerTabs.push(tab);
          }
        } catch (error) {
          console.log('[Popup] Ошибка при проверке вкладки', tab.id, ':', error);
        }
      }

      if (brokerTabs.length === 0) {
        console.log('[Popup] Не найдены вкладки брокера после проверки всех вкладок');
        resolve(null);
        return;
      }

      console.log('[Popup] Найдено', brokerTabs.length, 'брокерских вкладок, пытаемся получить BID с первой');

      // Пытаемся получить BID с первой найденной вкладки брокера
      chrome.scripting.executeScript({
        target: { tabId: brokerTabs[0].id },
        func: () => {
          // Функция для принудительного поиска BID с повторными попытками
          function forceGetBID(maxAttempts = 5, intervalMs = 2000) {
            return new Promise((resolve) => {
              let attempts = 0;
              
              const tryGetBID = () => {
                attempts++;
                console.log(`[DK] Попытка получения BID #${attempts}`);
                
                // Поиск элемента с классом info__id
                const divElement = document.querySelector('.info__id');
                
                if (divElement) {
                  const childWithDataHdShow = Array.from(divElement.children).find(child => child.hasAttribute('data-hd-show'));
                  if (childWithDataHdShow) {
                    const bid = childWithDataHdShow.getAttribute('data-hd-show');
                    const bidValue = bid ? bid.replace('id ', '') : null;

                    if (bidValue) {
                      console.log(`[DK] BID успешно получен на попытке #${attempts}:`, bidValue);
                      // Сохраняем BID в storage
                      if (typeof chrome !== 'undefined' && chrome.storage) {
                        chrome.storage.local.set({ USER_BID: bidValue });
                      }
                      resolve(bidValue);
                      return;
                    }
                  }
                }
                
                if (attempts >= maxAttempts) {
                  console.error(`[DK] Не удалось получить BID за ${maxAttempts} попыток`);
                  resolve(null);
                  return;
                }
                
                console.log(`[DK] BID не найден, следующая попытка через ${intervalMs}ms`);
                setTimeout(tryGetBID, intervalMs);
              };
              
              tryGetBID();
            });
          }
          
          return forceGetBID(5, 2000); // 5 попыток, интервал 2 сек
        }
      }, (results) => {
        if (chrome.runtime.lastError) {
          console.error('[Popup] Ошибка при выполнении скрипта:', chrome.runtime.lastError);
          resolve(null);
        } else if (results && results[0]) {
          resolve(results[0].result);
        } else {
          resolve(null);
        }
      });
    });
  });
}

/**
 * Функция для выхода из системы с указанием причины
 * @param {string} reason - Причина выхода
 */
function logout(reason = "Подписка истекла") {
  chrome.storage.local.remove(["authToken", "expected_bid"], () => {
    showLogin();
    document.getElementById("loginError").textContent = `${reason}. Войдите снова.`;
  });
}

/**
 * Проверяет статус подписки пользователя
 * @param {string} token - Токен авторизации  
 * @returns {Promise<boolean>} - Валидность подписки
 */
async function verifySubscription(token) {
  try {
    let { USER_BID } = await chrome.storage.local.get("USER_BID");
    
    // Если BID не найден, пытаемся получить его повторно
    if (!USER_BID) {
      console.log('[Popup] BID не найден при проверке подписки, попытка получить заново');
      
      try {
        USER_BID = await attemptGetBID();
        if (USER_BID) {
          console.log('[Popup] BID успешно получен при проверке подписки:', USER_BID);
          // Обновляем expected_bid, так как получили новый BID
          chrome.storage.local.set({ expected_bid: USER_BID });
        } else {
          console.log('[Popup] Не удалось получить BID при проверке подписки');
        }
      } catch (error) {
        console.error('[Popup] Ошибка при попытке получить BID:', error);
      }
    }
    
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        token,
        bid: USER_BID 
       })
    });
    
    // Если ответ не получен (например, timeout)
    if (!response) {
      console.error("Не удалось получить ответ от сервера");
      return true; // Сохраняем текущее состояние
    }
    
    const data = await response.json();
    console.log("Проверка, ответ:", data.message);
    
    if (!data.success || !data.subscriptionActive) {
      const reason = data.message || "Подписка неактивна или истекла";
      console.log(reason);
      logout(reason);
      return false;
    }
    
    // Проверка BID (Broker ID) - мягкая проверка
    const { expected_bid } = await chrome.storage.local.get("expected_bid");
    
    if (!USER_BID) {
      console.log("BID не найден даже после повторной попытки");
      // Показываем предупреждение только если на главной странице
      if (document.getElementById("statusBar") && 
          document.getElementById("mainSection").style.display !== "none") {
        document.getElementById("statusBar").textContent = "BID не получен! Откройте страницу брокера.";
      }
      return true; // Не выходим, только предупреждение
    }
    
    // Проверяем смену пользователя только если есть оба BID
    if (expected_bid && USER_BID && expected_bid !== USER_BID) {
      const reason = "Обнаружена смена пользователя";
      console.log(`${reason}! Выполняем выход.`);
      if (document.getElementById("statusBar")) {
        document.getElementById("statusBar").textContent = `${reason}! Выполняется выход...`;
      }
      logout(reason);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error("Ошибка при проверке подписки:", error);
    // В случае любой ошибки (сети, парсинга и т.д.) сохраняем текущее состояние
    return true;
  }
}

// ============================================================================
// ФУНКЦИИ УПРАВЛЕНИЯ UI
// ============================================================================

/**
 * Показывает форму входа
 */
function showLogin() {
  document.getElementById("loginSection").style.display = "";
  document.getElementById("mainSection").style.display = "none";
}

/**
 * Показывает основной интерфейс
 */
function showMain() {
  document.getElementById("loginSection").style.display = "none";
  document.getElementById("mainSection").style.display = "";
}

/**
 * Заполняет селектор валютных пар для выбранного актива
 * @param {string} asset - Код валюты
 */
function populatePairSelect(asset) {
  const pairSelect = document.getElementById("pairSelect");
  pairSelect.innerHTML = '<option value="">Валютная пара</option>';

  if (PAIRS[asset]) {
    pairSelect.disabled = false;
    PAIRS[asset].forEach(pair => {
      const option = document.createElement("option");
      option.value = pair;
      option.textContent = pair;
      pairSelect.appendChild(option);
    });
  } else {
    pairSelect.disabled = true;
  }
}

/**
 * Выбирает валютную пару на активной странице брокера
 * @param {string} pair - Валютная пара (например, EUR/USD)
 * @returns {Promise<boolean>} - Успешность выбора
 */
async function selectCurrencyPairOnPage(pair) {
  if (!pair) return false;
  
  // 1. Кликаем по основному селектору, чтобы открыть список пар
  const mainSelectorClicked = await clickElement('a.pair-number-wrap');
  if (!mainSelectorClicked) {
    console.error("Не удалось найти основной селектор валютных пар");
    return false;
  }
  
  // 2. Ждем немного для открытия списка
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // 3. Ищем нужную пару в списке и кликаем по ней
  const pairElements = await new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: (pairToFind) => {
          const elements = Array.from(document.querySelectorAll('span.alist__label'));
          const targetElement = elements.find(el => el.textContent.trim() === pairToFind);
          if (targetElement) {
            targetElement.click();
            return true;
          }
          return false;
        },
        args: [pair]
      }, (results) => {
        if (chrome.runtime.lastError) {
          console.error("Error executing script:", chrome.runtime.lastError);
          resolve(false);
        } else {
          resolve(results && results[0] && results[0].result);
        }
      });
    });
  });
  
  return pairElements;
}

/**
 * Отображает список новостей в контейнере
 * @param {Array} newsList - Массив объектов новостей
 */
function renderNews(newsList) {
  const container = document.getElementById("newsContainer");
  container.innerHTML = "";

  if (!newsList || !Array.isArray(newsList) || newsList.length === 0) {
    container.textContent = "Нет данных или не удалось загрузить.";
    return;
  }

  newsList.forEach(item => {
    const div = document.createElement("div");
    div.className = "news-item";
    div.dataset.currency = item.currency;
    div.dataset.event = item.event;

    // Добавляем класс для обработанных новостей
    if (isNewsProcessed(item)) {
      div.classList.add("processed");
    }

    // Создаем элементы новости
    const time = document.createElement("div");
    time.innerHTML = `<span class="label">Время:</span> ${item.time}`;

    const currency = document.createElement("div");
    currency.innerHTML = `<span class="label">Актив:</span> ${item.currency}`;

    const event = document.createElement("div");
    event.innerHTML = `<span class="label">Новость:</span> ${item.event}`;

    const importance = document.createElement("div");
    const stars = '★'.repeat(item.impact) + '☆'.repeat(3 - item.impact);
    importance.innerHTML = `<span class="label">Важность:</span> <span class="stars">${stars}</span>`;

    const actual = document.createElement("div");
    actual.innerHTML = `<span class="label">Факт:</span> <span class="actual" style="color: ${getColorFromType(item.actualType)}">${item.actual || "—"}</span>`;

    const forecast = document.createElement("div");
    forecast.innerHTML = `<span class="label">Прогноз:</span> <span class="forecast" style="color: ${getColorFromType(item.forecastType)}">${item.forecast || "—"}</span>`;

    const previous = document.createElement("div");
    previous.innerHTML = `<span class="label">Пред:</span> <span class="previous" style="color: ${getColorFromType(item.previousType)}">${item.previous || "—"}</span>`;

    // Добавляем элементы в контейнер новости
    div.appendChild(time);
    div.appendChild(currency);
    div.appendChild(event);
    div.appendChild(importance);
    div.appendChild(actual);
    div.appendChild(forecast);
    div.appendChild(previous);

    // Обработчик клика по новости
    div.addEventListener("click", () => {
      selectedNews = { event: item.event, currency: item.currency };
      selectedAsset = item.currency;
      document.getElementById("statusBar").textContent = `Фокусируем: ${item.event}`;
      document.querySelectorAll(".news-item").forEach(el => el.classList.remove("focused"));
      div.classList.add("focused");
      chrome.storage.local.set({ selectedNews, selectedAsset });
      
      // Обновляем список пар для выбранного актива
      populatePairSelect(selectedAsset);
    });

    container.appendChild(div);
  });

  // Выделяем ранее выбранную новость
  if (selectedNews) {
    document.querySelectorAll(".news-item").forEach(el => {
      if (el.dataset.currency === selectedNews.currency && el.dataset.event === selectedNews.event) {
        el.classList.add("focused");
      }
    });
    document.getElementById("statusBar").textContent = `Фокусируем: ${selectedNews.event}`;
  }
}

/**
 * Обновляет данные расширения через background script
 */
function updateExtension() {
  chrome.runtime.sendMessage({ action: "openInvesting" }, (response) => {
    if (response?.success) {
      chrome.storage.local.get(["newsData", "processedNews"], (result) => {
        if (result.newsData) {
          renderNews(result.newsData);
        }
        if (result.processedNews) {
          processedNews = result.processedNews;
        }
      });
    } else {
      document.getElementById("newsContainer").innerHTML = "Не удалось обновить данные.";
    }
  });
}

// ============================================================================
// ФУНКЦИИ РАБОТЫ С BACKGROUND SCRIPT
// ============================================================================

/**
 * Тестирует связь с background script
 */
function testBackgroundConnection() {
  console.log('[Popup] Тестирование связи с background script');
  
  chrome.runtime.sendMessage({ action: "getTradingState" }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[Popup] Ошибка связи с background:', chrome.runtime.lastError);
      document.getElementById("statusBar").textContent = "❌ Ошибка связи с background script";
      return;
    }
    
    if (response) {
      console.log('[Popup] Связь с background успешна:', response);
      document.getElementById("statusBar").textContent = "✅ Связь с background установлена";
    } else {
      console.log('[Popup] Background не отвечает');
      document.getElementById("statusBar").textContent = "❓ Background не отвечает";
    }
  });
}

/**
 * Синхронизирует состояние торговой системы с background script
 */
async function syncTradingSystemState() {
  console.log('[Popup] Синхронизация состояния торговой системы');
  
  chrome.runtime.sendMessage({ action: "getTradingState" }, (response) => {
    console.log('[Popup] Ответ на getTradingState:', response);
    
    if (chrome.runtime.lastError) {
      console.error('[Popup] Ошибка при получении состояния:', chrome.runtime.lastError);
      document.getElementById("statusBar").textContent = "Ошибка получения состояния";
      return;
    }
    
    if (response) {
      tradingSystemActive = response.isActive;
      const toggle = document.getElementById("autoClickToggle");
      if (toggle) {
        toggle.checked = tradingSystemActive;
        console.log('[Popup] Переключатель установлен в:', tradingSystemActive);
      }
      
      if (tradingSystemActive) {
        document.getElementById("statusBar").textContent = "Торговая система активна";
      } else {
        document.getElementById("statusBar").textContent = "Торговая система не активна";
      }
    } else {
      console.log('[Popup] Нет ответа от background script');
      document.getElementById("statusBar").textContent = "Нет связи с торговой системой";
    }
  });
}

/**
 * Инициализирует сохраненные данные из хранилища
 */
function initializeStoredData() {
  chrome.storage.local.get(
    ["newsData", "selectedNews", "selectedAsset", "selectedPair", "processedNews"], 
    (result) => {
      if (result.processedNews) {
        processedNews = result.processedNews;
      }
      
      if (result.newsData) renderNews(result.newsData);
      if (result.selectedNews) selectedNews = result.selectedNews;

      if (result.selectedAsset) {
        selectedAsset = result.selectedAsset;
        populatePairSelect(selectedAsset);
      }

      if (result.selectedPair) {
        selectedPair = result.selectedPair;
        const pairSelect = document.getElementById("pairSelect");
        if (pairSelect) {
          pairSelect.value = selectedPair;
        }
      }
    }
  );
}

// ============================================================================
// ОБРАБОТЧИКИ СОБЫТИЙ
// ============================================================================

// Обработчик кнопки входа
document.getElementById("loginButton")?.addEventListener("click", async () => {
  const login = document.getElementById("loginInput").value.trim();
  const password = document.getElementById("passwordInput").value.trim();
  const errorElement = document.getElementById("loginError");
  errorElement.textContent = "";
  
  if (!login || !password) {
    errorElement.textContent = "Введите логин и пароль";
    return;
  }

  // Проверка наличия BID (Broker ID)
  let { USER_BID } = await chrome.storage.local.get("USER_BID");
  
  if (!USER_BID) {
    errorElement.textContent = "Получение BID с сайта брокера...";
    console.log('[Popup] BID не найден, попытка получить через content script');
    
    try {
      USER_BID = await attemptGetBID();
      
      if (!USER_BID) {
        errorElement.textContent = "Не удалось получить BID. Откройте страницу брокера и попробуйте снова!";
        return;
      }
      
      console.log('[Popup] BID успешно получен:', USER_BID);
      errorElement.textContent = "BID получен, выполняется авторизация...";
    } catch (error) {
      console.error('[Popup] Ошибка при получении BID:', error);
      errorElement.textContent = "Ошибка при получении BID. Откройте страницу брокера!";
      return;
    }
  }

  try {
    const res = await fetch(SERVER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        login, 
        password,
        bid: USER_BID
      })
    });
    const data = await res.json();
    if (data.success && data.token) {
      chrome.storage.local.set({ 
        authToken: data.token,
        expected_bid: USER_BID
      }, () => {
        showMain();
        updateExtension();
        initializeStoredData();
        syncTradingSystemState();
      });
    } else {
      errorElement.textContent = data.message || "Неверный логин или пароль";
    }
  } catch (e) {
    console.error('[Popup] Ошибка соединения:', e);
    errorElement.textContent = "Ошибка соединения с сервером";
  }
});

// Обработчики кнопок торговли
document.getElementById("buyButton")?.addEventListener("click", async () => {
  const result = await clickElement(".action-high-low.button-call-wrap a.btn.btn-call");
  if (result) {
    document.getElementById("statusBar").textContent = "Ручная покупка выполнена";
  } else {
    document.getElementById("statusBar").textContent = "Ошибка при покупке";
  }
});

document.getElementById("sellButton")?.addEventListener("click", async () => {
  const result = await clickElement(".action-high-low.button-put-wrap a.btn.btn-put");
  if (result) {
    document.getElementById("statusBar").textContent = "Ручная продажа выполнена";
  } else {
    document.getElementById("statusBar").textContent = "Ошибка при продаже";
  }
});

// Обработчик тумблера торговой системы
document.getElementById("autoClickToggle")?.addEventListener("change", function(e) {
  console.log('[Popup] Переключатель изменен:', e.target.checked);
  
  if (e.target.checked) {
    if (!selectedNews || !selectedAsset || !selectedPair) {
      e.target.checked = false;
      document.getElementById("statusBar").textContent = "Выберите новость и валютную пару";
      return;
    }
    
    document.getElementById("statusBar").textContent = "Активация торговой системы...";
    
    chrome.runtime.sendMessage({
      action: "activateTrading",
      selectedNews: selectedNews,
      selectedAsset: selectedAsset,
      selectedPair: selectedPair
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[Popup] Ошибка runtime:', chrome.runtime.lastError);
        e.target.checked = false;
        document.getElementById("statusBar").textContent = "Ошибка соединения с background script";
        return;
      }
      
      if (response?.success) {
        tradingSystemActive = true;
        document.getElementById("statusBar").textContent = "Торговая система активирована";
      } else {
        e.target.checked = false;
        document.getElementById("statusBar").textContent = "Ошибка активации торговой системы";
      }
    });
  } else {
    document.getElementById("statusBar").textContent = "Отключение торговой системы...";
    
    chrome.runtime.sendMessage({ action: "deactivateTrading" }, (response) => {
      if (response?.success) {
        tradingSystemActive = false;
        document.getElementById("statusBar").textContent = "Торговая система отключена";
      } else {
        document.getElementById("statusBar").textContent = "Ошибка отключения торговой системы";
      }
    });
  }
});

// Обработчик селектора валютных пар
document.getElementById("pairSelect")?.addEventListener("change", async (e) => {
  selectedPair = e.target.value;
  chrome.storage.local.set({ selectedPair });
  
  if (selectedPair) {
    await selectCurrencyPairOnPage(selectedPair);
  }
});

// Обработчик клика по статус-бару
document.getElementById("statusBar")?.addEventListener("click", () => {
  if (selectedNews) {
    const el = Array.from(document.querySelectorAll(".news-item")).find(
      e => e.dataset.currency === selectedNews.currency && e.dataset.event === selectedNews.event
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
});

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================================

// Инициализация при загрузке popup
window.addEventListener('load', () => {
  console.log('[Popup] Popup загружен, инициализация...');
  
  testBackgroundConnection();
  
  setTimeout(() => {
    syncTradingSystemState();
  }, 500);
  
  // Слушаем изменения в storage для синхронизации состояния
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      if (changes.tradingSystemActive) {
        const toggle = document.getElementById("autoClickToggle");
        if (toggle) {
          toggle.checked = changes.tradingSystemActive.newValue;
          tradingSystemActive = changes.tradingSystemActive.newValue;
        }
      }
    }
  });
});

// Проверка токена и подписки при запуске
chrome.storage.local.get("authToken", async (result) => {
  if (result.authToken) {
    showMain();
    const isValid = await verifySubscription(result.authToken);
    if (!isValid) {
      return;
    }
  } else {
    showLogin();
  }
});

// Периодическая проверка подписки каждые 5 минут
setInterval(async () => {
  chrome.storage.local.get("authToken", async (result) => {
    if (result.authToken) {
      await verifySubscription(result.authToken);
    }
  });
}, 5 * 60 * 1000);

// Загрузка данных и периодические обновления
initializeStoredData();
setInterval(updateExtension, 5000);
updateExtension();
