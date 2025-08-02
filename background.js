// Глобальные переменные для торговой системы
let tradingSystem = {
  isActive: false,
  selectedNews: null,
  selectedAsset: "",
  selectedPair: "",
  lastProcessedFact: null,
  processedNews: {},
  initialNewsStates: {},
  autoClickInterval: null,
  monitoringInterval: null,
  startTime: null,
  MAX_TRADING_TIME: 24 * 60 * 60 * 1000 // 24 часа в миллисекундах
};

// Торговые правила
const TRADING_RULES = {
  "AUD": {
    "EUR/AUD": {"green": "sell", "red": "buy"},
    "AUD/USD": {"green": "buy", "red": "sell"},
    "AUD/CHF": {"green": "buy", "red": "sell"},
    "AUD/CAD": {"green": "buy", "red": "sell"},
    "GBP/AUD": {"green": "sell", "red": "buy"},
    "AUD/JPY": {"green": "buy", "red": "sell"}
  },
  "GBP": {
    "GBP/CAD": {"green": "buy", "red": "sell"},
    "GBP/USD": {"green": "buy", "red": "sell"},
    "GBP/CHF": {"green": "buy", "red": "sell"},
    "GBP/JPY": {"green": "buy", "red": "sell"},
    "EUR/GBP": {"green": "sell", "red": "buy"},
    "GBP/AUD": {"green": "buy", "red": "sell"}
  },
  "EUR": {
    "EUR/AUD": {"green": "buy", "red": "sell"},
    "EUR/USD": {"green": "buy", "red": "sell"},
    "EUR/JPY": {"green": "buy", "red": "sell"},
    "EUR/CAD": {"green": "buy", "red": "sell"},
    "EUR/CHF": {"green": "buy", "red": "sell"},
    "EUR/GBP": {"green": "buy", "red": "sell"}
  },
  "USD": {
    "EUR/USD": {"green": "sell", "red": "buy"},
    "AUD/USD": {"green": "sell", "red": "buy"},
    "USD/CAD": {"green": "buy", "red": "sell"},
    "GBP/USD": {"green": "sell", "red": "buy"},
    "USD/JPY": {"green": "buy", "red": "sell"},
    "USD/CHF": {"green": "buy", "red": "sell"}
  },
  "JPY": {
    "EUR/JPY": {"green": "sell", "red": "buy"},
    "USD/JPY": {"green": "sell", "red": "buy"},
    "CHF/JPY": {"green": "sell", "red": "buy"},
    "GBP/JPY": {"green": "sell", "red": "buy"},
    "AUD/JPY": {"green": "sell", "red": "buy"},
    "CAD/JPY": {"green": "sell", "red": "buy"}
  },
  "CHF": {
    "AUD/CHF": {"green": "sell", "red": "buy"},
    "GBP/CHF": {"green": "sell", "red": "buy"},
    "EUR/CHF": {"green": "sell", "red": "buy"},
    "CHF/JPY": {"green": "buy", "red": "sell"},
    "USD/CHF": {"green": "sell", "red": "buy"},
    "CAD/CHF": {"green": "sell", "red": "buy"}
  },
  "CAD": {
    "GBP/CAD": {"green": "sell", "red": "buy"},
    "EUR/CAD": {"green": "sell", "red": "buy"},
    "USD/CAD": {"green": "sell", "red": "buy"},
    "CAD/CHF": {"green": "buy", "red": "sell"},
    "AUD/CAD": {"green": "sell", "red": "buy"},
    "CAD/JPY": {"green": "buy", "red": "sell"}
  }
};

// Функция для выполнения торговых операций через content script
async function executeTrade(action, newsItem) {
  if (isNewsProcessed(newsItem)) {
    console.log("Эта новость уже обработана, пропускаем");
    return false;
  }

  try {
    const tabs = await chrome.tabs.query({ url: "*://*/*" });
    console.log('[executeTrade] Проверка', tabs.length, 'вкладок на предмет брокерских сайтов');
    
    // Ищем вкладку брокера с помощью той же логики, что и в checkBrokerMeta
    let brokerTab = null;
    
    for (const tab of tabs) {
      // Пропускаем системные вкладки
      if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        continue;
      }
      
      try {
        // Проверяем, является ли вкладка брокерским сайтом
        const results = await new Promise((resolve) => {
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: checkBrokerMeta
          }, (results) => {
            if (chrome.runtime.lastError) {
              console.log('[executeTrade] Не удалось проверить вкладку', tab.id, ':', chrome.runtime.lastError.message);
              resolve(false);
            } else if (results && results[0]) {
              resolve(results[0].result);
            } else {
              resolve(false);
            }
          });
        });
        
        if (results) {
          console.log('[executeTrade] Найден брокерский сайт на вкладке:', tab.url);
          brokerTab = tab;
          break; // Используем первую найденную вкладку
        }
      } catch (error) {
        console.log('[executeTrade] Ошибка при проверке вкладки', tab.id, ':', error);
      }
    }

    if (!brokerTab) {
      console.error("Не найдена вкладка брокера");
      return false;
    }

    const selector = action === "buy" 
      ? ".action-high-low.button-call-wrap a.btn.btn-call" 
      : ".action-high-low.button-put-wrap a.btn.btn-put";

    const results = await chrome.scripting.executeScript({
      target: { tabId: brokerTab.id },
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
      args: [selector]
    });

    if (results && results[0] && results[0].result) {
      console.log(`Выполнена ${action === "buy" ? "покупка" : "продажа"}`);
      markNewsAsProcessed(newsItem);
      
      // Создание уведомления
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'DK NEWS HUNTERS',
        message: `Авто-торговля: ${action === "buy" ? "Покупка" : "Продажа"} (${tradingSystem.selectedAsset}/${tradingSystem.selectedPair})`
      });

      // Логирование операции
      const tradeLog = {
        timestamp: new Date().toISOString(),
        action: action === "buy" ? "Покупка" : "Продажа",
        asset: tradingSystem.selectedAsset,
        pair: tradingSystem.selectedPair,
        news: newsItem.event,
        factType: newsItem.actualType
      };

      chrome.storage.local.get(['tradeHistory'], (result) => {
        const history = result.tradeHistory || [];
        history.push(tradeLog);
        chrome.storage.local.set({ tradeHistory: history });
      });

      // Автоматическое отключение после торговли
      setTimeout(() => {
        deactivateTradingSystem("Торговля выполнена");
      }, 5000); // 5 секунд задержки

      return true;
    }
    return false;
  } catch (error) {
    console.error("Ошибка при выполнении торговли:", error);
    return false;
  }
}

// Проверка условий торговли
function checkTradingConditions(newsItem) {
  if (!tradingSystem.selectedNews || !tradingSystem.selectedAsset || !tradingSystem.selectedPair || 
      !newsItem.actual || newsItem.actual === "—") {
    return false;
  }

  if (isNewsProcessed(newsItem)) {
    return false;
  }

  if (hadFactInitially(newsItem)) {
    return false;
  }

  const factColor = newsItem.actualType;
  if (factColor !== 'GFP' && factColor !== 'RFP') {
    return false;
  }

  const factKey = factColor === 'GFP' ? 'green' : 'red';
  const tradingPair = TRADING_RULES[tradingSystem.selectedAsset]?.[tradingSystem.selectedPair];
  
  if (!tradingPair || !tradingPair[factKey]) {
    return false;
  }

  return tradingPair[factKey];
}

// Помощные функции для обработки новостей
function isNewsProcessed(newsItem) {
  if (!newsItem) return true;
  const key = `${newsItem.event}_${newsItem.currency}_${newsItem.actual}`;
  return tradingSystem.processedNews[key] || false;
}

function markNewsAsProcessed(newsItem) {
  if (!newsItem) return;
  const key = `${newsItem.event}_${newsItem.currency}_${newsItem.actual}`;
  tradingSystem.processedNews[key] = true;
  chrome.storage.local.set({ processedNews: tradingSystem.processedNews });
}

function saveInitialNewsState(newsItem) {
  if (!newsItem) return;
  const key = `${newsItem.event}_${newsItem.currency}`;
  tradingSystem.initialNewsStates[key] = {
    hasFact: newsItem.actual && newsItem.actual !== "—",
    factType: newsItem.actualType
  };
}

function hadFactInitially(newsItem) {
  if (!newsItem) return true;
  const key = `${newsItem.event}_${newsItem.currency}`;
  return tradingSystem.initialNewsStates[key]?.hasFact || false;
}

// Обработка данных новостей
function processNewsData(newsData) {
  if (!tradingSystem.selectedNews || !newsData || !Array.isArray(newsData)) return;

  const focusedNews = newsData.find(item => 
    item.event === tradingSystem.selectedNews.event && 
    item.currency === tradingSystem.selectedNews.currency
  );

  if (!focusedNews) {
    tradingSystem.lastProcessedFact = null;
    return;
  }

  const newsKey = `${focusedNews.event}_${focusedNews.currency}`;
  if (!tradingSystem.initialNewsStates[newsKey]) {
    saveInitialNewsState(focusedNews);
  }

  if (!focusedNews.actual || focusedNews.actual === "—") {
    tradingSystem.lastProcessedFact = null;
    return;
  }

  const factKey = `${focusedNews.actual}-${focusedNews.actualType}`;
  if (factKey === tradingSystem.lastProcessedFact) return;

  tradingSystem.lastProcessedFact = factKey;
  const tradeAction = checkTradingConditions(focusedNews);
  
  if (tradeAction) {
    executeTrade(tradeAction, focusedNews);
  }
}

// Активация торговой системы
function activateTradingSystem(newsSelection, asset, pair) {
  tradingSystem.isActive = true;
  tradingSystem.selectedNews = newsSelection;
  tradingSystem.selectedAsset = asset;
  tradingSystem.selectedPair = pair;
  tradingSystem.startTime = Date.now();

  // Сохранение состояния
  chrome.storage.local.set({
    tradingSystemActive: true,
    tradingSystemState: {
      selectedNews: newsSelection,
      selectedAsset: asset,
      selectedPair: pair,
      startTime: tradingSystem.startTime
    }
  });

  // Запуск мониторинга
  if (tradingSystem.monitoringInterval) {
    clearInterval(tradingSystem.monitoringInterval);
  }

  tradingSystem.monitoringInterval = setInterval(() => {
    // Проверка таймаута
    if (Date.now() - tradingSystem.startTime > tradingSystem.MAX_TRADING_TIME) {
      deactivateTradingSystem("Превышено максимальное время работы");
      return;
    }

    // Обновление новостей и обработка
    updateNewsData();
  }, 1000);

  // Запуск авто-клика
  startAutoClick();

  console.log("Торговая система активирована");
}

// Деактивация торговой системы
function deactivateTradingSystem(reason = "Отключено вручную") {
  tradingSystem.isActive = false;
  
  if (tradingSystem.monitoringInterval) {
    clearInterval(tradingSystem.monitoringInterval);
    tradingSystem.monitoringInterval = null;
  }

  stopAutoClick();

  // Сохранение состояния
  chrome.storage.local.set({
    tradingSystemActive: false,
    tradingSystemState: null
  });

  // Уведомление об отключении
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: 'DK NEWS HUNTERS',
    message: `Торговая система отключена: ${reason}`
  });

  console.log(`Торговая система деактивирована: ${reason}`);
}

// Функции авто-клика
function startAutoClick() {
  clickTodayButton();
  if (tradingSystem.autoClickInterval) {
    clearInterval(tradingSystem.autoClickInterval);
  }
  tradingSystem.autoClickInterval = setInterval(clickTodayButton, 15000);
}

function stopAutoClick() {
  if (tradingSystem.autoClickInterval) {
    clearInterval(tradingSystem.autoClickInterval);
    tradingSystem.autoClickInterval = null;
  }
}

function clickTodayButton() {
  const selector = 'a#timeFrame_today.newBtn.toggleButton.LightGray';

  chrome.tabs.query({ url: "https://ru.investing.com/*" }, (tabs) => {
    if (tabs.length > 0) {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: (sel) => {
          const element = document.querySelector(sel);
          if (element) {
            element.click();
            console.log("Клик по кнопке 'Сегодня' выполнен");
            return true;
          }
          return false;
        },
        args: [selector]
      }, (results) => {
        if (chrome.runtime.lastError) {
          console.error("Ошибка при клике:", chrome.runtime.lastError);
        }
      });
    }
  });
}

// Обновление данных новостей
function updateNewsData() {
  const investingUrl = "https://ru.investing.com/economic-calendar/";

  const handleResult = (tabId) => {
    chrome.scripting.executeScript({
      target: { tabId },
      func: extractNewsData
    }, (results) => {
      if (results && results[0] && results[0].result) {
        chrome.storage.local.set({ newsData: results[0].result });
        if (tradingSystem.isActive) {
          processNewsData(results[0].result);
        }
      }
    });
  };

  chrome.tabs.query({ url: investingUrl + "*" }, (tabs) => {
    if (tabs.length > 0) {
      handleResult(tabs[0].id);
    } else {
      chrome.tabs.create({ url: investingUrl, active: false }, (newTab) => {
        chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
          if (tabId === newTab.id && info.status === "complete") {
            chrome.tabs.onUpdated.removeListener(listener);
            handleResult(tabId);
          }
        });
      });
    }
  });
}

// Обработчик сообщений
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "openInvesting") {
    updateNewsData();
    sendResponse({ success: true });
    return true;
  }

  if (message.action === "activateTrading") {
    activateTradingSystem(message.selectedNews, message.selectedAsset, message.selectedPair);
    sendResponse({ success: true });
    return true;
  }

  if (message.action === "deactivateTrading") {
    deactivateTradingSystem("Отключено пользователем");
    sendResponse({ success: true });
    return true;
  }

  if (message.action === "getTradingState") {
    sendResponse({ 
      isActive: tradingSystem.isActive,
      state: tradingSystem
    });
    return true;
  }

  if (message.action === "executeTrade") {
    executeTrade(message.tradeAction, message.newsItem).then(result => {
      sendResponse({ success: result });
    });
    return true;
  }

  if (message.action === "clearProcessedNews") {
    // Очищаем обработанные новости (для debug режима)
    tradingSystem.processedNews = {};
    tradingSystem.initialNewsStates = {};
    tradingSystem.lastProcessedFact = null;
    chrome.storage.local.remove(['processedNews']);
    console.log('[Background] Обработанные новости очищены (DEBUG MODE)');
    sendResponse({ success: true });
    return true;
  }

  if (message.action === "resetTradingSystem") {
    // Полный сброс торговой системы (для debug режима)
    tradingSystem.processedNews = {};
    tradingSystem.initialNewsStates = {};
    tradingSystem.lastProcessedFact = null;
    chrome.storage.local.remove(['processedNews']);
    
    if (tradingSystem.isActive) {
      deactivateTradingSystem("Сброс системы (DEBUG MODE)");
    }
    
    console.log('[Background] Торговая система полностью сброшена (DEBUG MODE)');
    sendResponse({ success: true });
    return true;
  }
});

// Инициализация системы
function initializeTradingSystem() {
  console.log('[Background] Инициализация торговой системы');
  
  // Восстановление состояния торговой системы
  chrome.storage.local.get(['tradingSystemActive', 'tradingSystemState', 'processedNews'], (result) => {
    console.log('[Background] Загруженное состояние:', result);
    
    if (result.processedNews) {
      tradingSystem.processedNews = result.processedNews;
    }

    if (result.tradingSystemActive && result.tradingSystemState) {
      const state = result.tradingSystemState;
      
      // Проверка, не истек ли таймаут
      if (Date.now() - state.startTime < tradingSystem.MAX_TRADING_TIME) {
        console.log('[Background] Восстановление активной торговой системы');
        activateTradingSystem(state.selectedNews, state.selectedAsset, state.selectedPair);
        tradingSystem.startTime = state.startTime; // Восстанавливаем оригинальное время старта
      } else {
        // Таймаут истек, очищаем состояние
        console.log('[Background] Таймаут истек, очищаем состояние');
        chrome.storage.local.set({
          tradingSystemActive: false,
          tradingSystemState: null
        });
      }
    }
  });
}

// Инициализация при запуске
chrome.runtime.onStartup.addListener(() => {
  console.log('[Background] onStartup');
  initializeTradingSystem();
});

// Обработка установки расширения
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Background] onInstalled');
  
  // Сброс состояния при установке/обновлении
  chrome.storage.local.set({
    tradingSystemActive: false,
    tradingSystemState: null
  }, () => {
    console.log('[Background] Состояние сброшено');
    initializeTradingSystem();
  });
});

// Инициализация при первом запуске (для тестирования)
initializeTradingSystem();

// ============================================================================
// ФУНКЦИИ ДЛЯ РАБОТЫ С BID И АВТОРИЗАЦИЕЙ В BACKGROUND
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
 * Пытается получить BID из открытых вкладок брокера (версия для background)
 * @returns {Promise<string|null>} - BID или null при неудаче
 */
async function attemptGetBIDBackground() {
  return new Promise((resolve) => {
    chrome.tabs.query({ url: "*://*/*" }, async (tabs) => {
      console.log('[Background] Проверка', tabs.length, 'вкладок на предмет брокерских сайтов');
      
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
                console.log('[Background] Не удалось проверить вкладку', tab.id, ':', chrome.runtime.lastError.message);
                tabResolve(false);
              } else if (results && results[0]) {
                tabResolve(results[0].result);
              } else {
                tabResolve(false);
              }
            });
          });
          
          if (results) {
            console.log('[Background] Найден брокерский сайт на вкладке:', tab.url);
            brokerTabs.push(tab);
          }
        } catch (error) {
          console.log('[Background] Ошибка при проверке вкладки', tab.id, ':', error);
        }
      }

      if (brokerTabs.length === 0) {
        console.log('[Background] Не найдены вкладки брокера после проверки всех вкладок');
        resolve(null);
        return;
      }

      console.log('[Background] Найдено', brokerTabs.length, 'брокерских вкладок, пытаемся получить BID с первой');

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
          console.error('[Background] Ошибка при выполнении скрипта:', chrome.runtime.lastError);
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
 * Проверяет статус подписки пользователя (версия для background)
 * @param {string} token - Токен авторизации  
 * @returns {Promise<boolean>} - Валидность подписки
 */
async function verifySubscriptionBackground(token) {
  try {
    let { USER_BID } = await chrome.storage.local.get("USER_BID");
    
    // Если BID не найден, пытаемся получить его повторно
    if (!USER_BID) {
      console.log('[Background] BID не найден при проверке подписки, попытка получить заново');
      
      try {
        USER_BID = await attemptGetBIDBackground();
        if (USER_BID) {
          console.log('[Background] BID успешно получен при проверке подписки:', USER_BID);
          // Обновляем expected_bid, так как получили новый BID
          chrome.storage.local.set({ expected_bid: USER_BID });
        } else {
          console.log('[Background] Не удалось получить BID при проверке подписки');
        }
      } catch (error) {
        console.error('[Background] Ошибка при попытке получить BID:', error);
      }
    }
    
    const response = await fetch("http://176.108.253.203:8000/verify", {
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
      console.error("[Background] Не удалось получить ответ от сервера");
      return true; // Сохраняем текущее состояние
    }
    
    const data = await response.json();
    console.log("[Background] Проверка, ответ:", data.message);
    
    if (!data.success || !data.subscriptionActive) {
      const reason = data.message || "Подписка неактивна или истекла";
      console.log("[Background]", reason);
      
      // Очищаем токен и отключаем торговую систему
      chrome.storage.local.remove(["authToken", "expected_bid"]);
      if (tradingSystem.isActive) {
        deactivateTradingSystem(reason);
      }
      
      return false;
    }
    
    // Проверка BID (Broker ID) - мягкая проверка
    const { expected_bid } = await chrome.storage.local.get("expected_bid");
    
    if (!USER_BID) {
      console.log("[Background] BID не найден даже после повторной попытки");
      return true; // Не выходим, только предупреждение
    }
    
    // Проверяем смену пользователя только если есть оба BID
    if (expected_bid && USER_BID && expected_bid !== USER_BID) {
      const reason = "Обнаружена смена пользователя";
      console.log(`[Background] ${reason}! Выполняем выход.`);
      
      // Очищаем токен и отключаем торговую систему
      chrome.storage.local.remove(["authToken", "expected_bid"]);
      if (tradingSystem.isActive) {
        deactivateTradingSystem(reason);
      }
      
      return false;
    }
    
    return true;
  } catch (error) {
    console.error("[Background] Ошибка при проверке подписки:", error);
    // В случае любой ошибки (сети, парсинга и т.д.) сохраняем текущее состояние
    return true;
  }
}

// ============================================================================
// ПЕРИОДИЧЕСКИЕ ПРОВЕРКИ В BACKGROUND
// ============================================================================

// Периодическая проверка подписки каждые 5 минут
setInterval(async () => {
  chrome.storage.local.get("authToken", async (result) => {
    if (result.authToken) {
      console.log('[Background] Выполняется периодическая проверка подписки');
      await verifySubscriptionBackground(result.authToken);
    }
  });
}, 5 * 60 * 1000);

console.log('[Background] Периодическая проверка подписки активирована (каждые 5 минут)');

function extractNewsData() {
  const rows = document.querySelectorAll("table.genTbl tr.js-event-item");
  const news = [];

  rows.forEach((row) => {
    try {
      const timeElement = row.querySelector(".first.left.time.js-time");
      const eventElement = row.querySelector("a[href^='/economic-calendar']");
      const currencyElement = row.querySelector(".flagCur");
      const sentimentElement = row.querySelector(".sentiment");
      const actualElement = row.querySelector("td.act");
      const forecastElement = row.querySelector("td.fore");
      const previousElement = row.querySelector("td.prev");

      const timeStr = timeElement ? timeElement.textContent.trim() : '';
      const event = eventElement ? eventElement.textContent.trim() : '';
      const currency = currencyElement ? currencyElement.textContent.trim().split(/\s+/).pop() : 'Неизвестно';
      const impact = sentimentElement ? sentimentElement.querySelectorAll("i.grayFullBullishIcon").length : 0;
      const actual = actualElement ? actualElement.textContent.trim() : '—';
      const forecast = forecastElement ? forecastElement.textContent.trim() : '—';
      const previous = previousElement ? previousElement.textContent.trim() : '—';

      const actualType = actualElement ?
        (actualElement.classList.contains('greenFont') ? 'GFP' :
        actualElement.classList.contains('redFont') ? 'RFP' :
        actualElement.classList.contains('blackFont') ? 'BFP' : 'NFP') : 'NFP';

      const forecastType = forecastElement ?
        (forecastElement.classList.contains('greenFont') ? 'GFP' :
        forecastElement.classList.contains('redFont') ? 'RFP' :
        forecastElement.classList.contains('blackFont') ? 'BFP' : 'NFP') : 'NFP';

      const previousType = previousElement ?
        (previousElement.classList.contains('greenFont') ? 'GFP' :
        previousElement.classList.contains('redFont') ? 'RFP' :
        previousElement.classList.contains('blackFont') ? 'BFP' : 'NFP') : 'NFP';

      const factSelector = actualElement && actualElement.id ? `#${actualElement.id}` : null;

      if (timeStr && event) {
        news.push({
          time: timeStr,
          event,
          currency,
          impact,
          actual,
          actualType,
          forecast,
          forecastType,
          previous,
          previousType,
          factSelector
        });
      }
    } catch (e) {
      console.error("Ошибка при обработке строки новости:", e);
    }
  });

  return news;
}
