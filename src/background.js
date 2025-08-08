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
  console.log(`[executeTrade] 🚀 НАЧАЛО ТОРГОВОЙ ОПЕРАЦИИ: ${action.toUpperCase()}`);
  console.log(`[executeTrade] 📰 Новость: ${newsItem?.event || 'неизвестно'}`);
  console.log(`[executeTrade] 💱 Валюта: ${newsItem?.currency || 'неизвестно'}`);
  console.log(`[executeTrade] 📊 Факт: ${newsItem?.actual || 'неизвестно'} (${newsItem?.actualType || 'неизвестно'})`);
  console.log(`[executeTrade] ⏰ Время: ${new Date().toLocaleTimeString()}`);

  if (isNewsProcessed(newsItem)) {
    console.log("[executeTrade] ❌ Эта новость уже обработана, пропускаем");
    return false;
  }

  try {
    const tabs = await chrome.tabs.query({ url: "*://*/*" });
    console.log(`[executeTrade] 🔍 Начинаю проверку ${tabs.length} вкладок на предмет брокерских сайтов`);
    
    // Логируем информацию о всех вкладках для диагностики
    const tabsInfo = tabs.slice(0, 10).map(tab => ({
      id: tab.id,
      url: tab.url?.substring(0, 50) + '...',
      title: tab.title?.substring(0, 30) + '...',
      status: tab.status,
      active: tab.active
    }));
    console.log('[executeTrade] 📑 Первые 10 вкладок:', JSON.stringify(tabsInfo, null, 2));
    
    // Ищем вкладку брокера с помощью той же логики, что и в checkBrokerMeta
    let brokerTab = null;
    let checkedTabs = 0;
    let errorTabs = 0;
    
    console.log('[executeTrade] 🔍 Начинаю поиск брокерских вкладок...');
    
    for (const tab of tabs) {
      // Пропускаем системные вкладки
      if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        console.log(`[executeTrade] ⏭️ Пропуск системной вкладки: ${tab.url?.substring(0, 50)}`);
        continue;
      }
      
      checkedTabs++;
      console.log(`[executeTrade] 🔍 Проверка вкладки ${checkedTabs}: ID=${tab.id}, URL=${tab.url?.substring(0, 80)}, Status=${tab.status}`);
      
      try {
        // Проверяем, является ли вкладка брокерским сайтом
        const results = await new Promise((resolve) => {
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: checkBrokerMeta
          }, (results) => {
            if (chrome.runtime.lastError) {
              console.log(`[executeTrade] ❌ Не удалось проверить вкладку ${tab.id}: ${chrome.runtime.lastError.message}`);
              resolve(false);
            } else if (results && results[0]) {
              console.log(`[executeTrade] ✅ Результат проверки вкладки ${tab.id}: ${results[0].result}`);
              resolve(results[0].result);
            } else {
              console.log(`[executeTrade] ⚠️ Пустой результат для вкладки ${tab.id}`);
              resolve(false);
            }
          });
        });
        
        if (results) {
          console.log(`[executeTrade] 🎯 НАЙДЕН брокерский сайт на вкладке ${tab.id}: ${tab.url}`);
          console.log(`[executeTrade] 📊 Статус найденной вкладки: ${tab.status}, Активная: ${tab.active}`);
          brokerTab = tab;
          break; // Используем первую найденную вкладку
        } else {
          console.log(`[executeTrade] ❌ Вкладка ${tab.id} не является брокерской`);
        }
      } catch (error) {
        errorTabs++;
        console.log(`[executeTrade] 💥 Ошибка при проверке вкладки ${tab.id}: ${error.message}`);
      }
    }

    console.log(`[executeTrade] 📊 ИТОГИ ПОИСКА: Проверено вкладок: ${checkedTabs}, Ошибок: ${errorTabs}, Найдено брокерских: ${brokerTab ? 1 : 0}`);

    if (!brokerTab) {
      console.error("[executeTrade] ❌ КРИТИЧЕСКАЯ ОШИБКА: Не найдена вкладка брокера!");
      console.error(`[executeTrade] 📊 Статистика: Всего вкладок: ${tabs.length}, Проверено: ${checkedTabs}, Ошибок: ${errorTabs}`);
      return false;
    }

    console.log(`[executeTrade] 🎯 Использую брокерскую вкладку: ID=${brokerTab.id}, URL=${brokerTab.url}`);

    const selector = action === "buy" 
      ? ".action-high-low.button-call-wrap a.btn.btn-call" 
      : ".action-high-low.button-put-wrap a.btn.btn-put";

    console.log(`[executeTrade] 🎯 Селектор для ${action}: ${selector}`);
    console.log(`[executeTrade] 🔄 Выполняю инъекцию скрипта в вкладку ${brokerTab.id}...`);

    const results = await chrome.scripting.executeScript({
      target: { tabId: brokerTab.id },
      func: (sel, actionType) => {
        console.log(`[DK-Injected] 🚀 Скрипт инъецирован! Ищу элемент: ${sel}`);
        console.log(`[DK-Injected] 🔍 Действие: ${actionType}`);
        console.log(`[DK-Injected] 🌐 URL страницы: ${window.location.href}`);
        console.log(`[DK-Injected] 📊 Состояние документа: ${document.readyState}`);
        
        // Проверим состояние DOM
        const bodyExists = !!document.body;
        const elementCount = document.querySelectorAll('*').length;
        console.log(`[DK-Injected] 📋 Body exists: ${bodyExists}, Элементов в DOM: ${elementCount}`);
        
        const element = document.querySelector(sel);
        console.log(`[DK-Injected] 🔍 Результат поиска элемента: ${element ? 'НАЙДЕН' : 'НЕ НАЙДЕН'}`);
        
        if (element) {
          console.log(`[DK-Injected] ✅ Элемент найден:`, {
            tagName: element.tagName,
            className: element.className,
            id: element.id,
            visible: element.offsetParent !== null,
            disabled: element.disabled,
            style: element.style.cssText
          });
          
          const event = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
          });
          
          console.log(`[DK-Injected] 👆 Выполняю клик по элементу...`);
          element.dispatchEvent(event);
          
          console.log(`[DK-Injected] ✅ Клик выполнен успешно для ${actionType}: ${sel}`);
          return { success: true, elementFound: true, clickExecuted: true };
        } else {
          console.warn(`[DK-Injected] ❌ Элемент не найден: ${sel}`);
          
          // Попытаемся найти альтернативные элементы для диагностики
          const alternativeSelectors = [
            '.btn-call', '.btn-put', 
            '[data-action="call"]', '[data-action="put"]',
            '.call-button', '.put-button',
            '.trade-button', '.trading-button'
          ];
          
          console.log(`[DK-Injected] 🔍 Поиск альтернативных селекторов...`);
          alternativeSelectors.forEach(altSel => {
            const altElement = document.querySelector(altSel);
            if (altElement) {
              console.log(`[DK-Injected] 🔍 Найден альтернативный элемент: ${altSel}`, altElement);
            }
          });
          
          return { success: false, elementFound: false, clickExecuted: false };
        }
      },
      args: [selector, action]
    });

    console.log(`[executeTrade] 📊 РЕЗУЛЬТАТ ИНЪЕКЦИИ:`, results);

    if (results && results[0]) {
      const result = results[0].result;
      console.log(`[executeTrade] 📋 Детали результата:`, result);
      
      if (result && result.success) {
        console.log(`[executeTrade] 🎉 УСПЕХ! Выполнена ${action === "buy" ? "покупка" : "продажа"}`);
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
          factType: newsItem.actualType,
          debugInfo: {
            brokerTabId: brokerTab.id,
            brokerUrl: brokerTab.url,
            selector: selector,
            elementFound: result.elementFound,
            clickExecuted: result.clickExecuted
          }
        };

        console.log(`[executeTrade] 📝 Сохраняю лог операции:`, tradeLog);

        chrome.storage.local.get(['tradeHistory'], (result) => {
          const history = result.tradeHistory || [];
          history.push(tradeLog);
          chrome.storage.local.set({ tradeHistory: history });
          console.log(`[executeTrade] 💾 Лог сохранен, всего записей: ${history.length}`);
        });

        // Автоматическое отключение после торговли
        console.log(`[executeTrade] ⏰ Автоматическое отключение через 5 секунд...`);
        setTimeout(() => {
          deactivateTradingSystem("Торговля выполнена");
        }, 5000);

        return true;
      } else {
        console.error(`[executeTrade] ❌ НЕУДАЧА: Элемент не найден или клик не выполнен`);
        console.error(`[executeTrade] 📊 Детали ошибки:`, {
          elementFound: result?.elementFound || false,
          clickExecuted: result?.clickExecuted || false,
          selector: selector,
          brokerTabId: brokerTab.id,
          brokerUrl: brokerTab.url
        });
      }
    } else {
      console.error(`[executeTrade] ❌ КРИТИЧЕСКАЯ ОШИБКА: Не получен результат от инъекции скрипта`);
      console.error(`[executeTrade] 📊 Результаты:`, results);
    }
    
    return false;
  } catch (error) {
    console.error(`[executeTrade] 💥 ИСКЛЮЧЕНИЕ при выполнении торговли: ${error.message}`);
    console.error(`[executeTrade] 📊 Stack trace:`, error.stack);
    console.error(`[executeTrade] 🔧 Параметры:`, {
      action,
      newsItem,
      selectedAsset: tradingSystem.selectedAsset,
      selectedPair: tradingSystem.selectedPair
    });
    return false;
  }
}

// Проверка условий торговли
function checkTradingConditions(newsItem) {
  console.log(`[checkTradingConditions] 🔍 ПРОВЕРКА УСЛОВИЙ ТОРГОВЛИ`);
  console.log(`[checkTradingConditions] 📰 Новость: ${newsItem?.event || 'неизвестно'}`);
  console.log(`[checkTradingConditions] 💱 Валюта: ${newsItem?.currency || 'неизвестно'}`);
  console.log(`[checkTradingConditions] 📊 Факт: ${newsItem?.actual || 'неизвестно'} (${newsItem?.actualType || 'неизвестно'})`);

  // Проверка базовых данных
  const hasSelectedNews = !!tradingSystem.selectedNews;
  const hasSelectedAsset = !!tradingSystem.selectedAsset;
  const hasSelectedPair = !!tradingSystem.selectedPair;
  const hasActual = !!(newsItem?.actual && newsItem.actual !== "—");

  console.log(`[checkTradingConditions] 📋 Выбранная новость: ${hasSelectedNews ? 'ДА' : 'НЕТ'} (${tradingSystem.selectedNews?.event || 'отсутствует'})`);
  console.log(`[checkTradingConditions] 🎯 Выбранный актив: ${hasSelectedAsset ? 'ДА' : 'НЕТ'} (${tradingSystem.selectedAsset || 'отсутствует'})`);
  console.log(`[checkTradingConditions] 💹 Выбранная пара: ${hasSelectedPair ? 'ДА' : 'НЕТ'} (${tradingSystem.selectedPair || 'отсутствует'})`);
  console.log(`[checkTradingConditions] 📊 Наличие факта: ${hasActual ? 'ДА' : 'НЕТ'}`);

  if (!hasSelectedNews || !hasSelectedAsset || !hasSelectedPair || !hasActual) {
    console.log(`[checkTradingConditions] ❌ ОТКЛОНЕНО: Отсутствуют базовые данные`);
    return false;
  }

  // Проверка на обработанность новости
  const isProcessed = isNewsProcessed(newsItem);
  console.log(`[checkTradingConditions] 🔄 Новость уже обработана: ${isProcessed ? 'ДА' : 'НЕТ'}`);
  if (isProcessed) {
    console.log(`[checkTradingConditions] ❌ ОТКЛОНЕНО: Новость уже обработана`);
    return false;
  }

  // Проверка на первоначальное наличие факта
  const hadInitialFact = hadFactInitially(newsItem);
  console.log(`[checkTradingConditions] 🕐 Факт был изначально: ${hadInitialFact ? 'ДА' : 'НЕТ'}`);
  if (hadInitialFact) {
    console.log(`[checkTradingConditions] ❌ ОТКЛОНЕНО: Факт присутствовал изначально`);
    return false;
  }

  // Проверка типа факта
  const factColor = newsItem.actualType;
  const isValidFactType = (factColor === 'GFP' || factColor === 'RFP');
  console.log(`[checkTradingConditions] 🎨 Тип факта: ${factColor}, Валидный: ${isValidFactType ? 'ДА' : 'НЕТ'}`);
  
  if (!isValidFactType) {
    console.log(`[checkTradingConditions] ❌ ОТКЛОНЕНО: Недопустимый тип факта (${factColor})`);
    return false;
  }

  // Проверка торговых правил
  const factKey = factColor === 'GFP' ? 'green' : 'red';
  const tradingPair = TRADING_RULES[tradingSystem.selectedAsset]?.[tradingSystem.selectedPair];
  
  console.log(`[checkTradingConditions] 🔑 Ключ факта: ${factKey}`);
  console.log(`[checkTradingConditions] 📖 Торговые правила для ${tradingSystem.selectedAsset}/${tradingSystem.selectedPair}:`, tradingPair);
  
  if (!tradingPair || !tradingPair[factKey]) {
    console.log(`[checkTradingConditions] ❌ ОТКЛОНЕНО: Отсутствуют торговые правила для ${factKey}`);
    return false;
  }

  const tradeAction = tradingPair[factKey];
  console.log(`[checkTradingConditions] ✅ ОДОБРЕНО! Рекомендуемое действие: ${tradeAction.toUpperCase()}`);
  console.log(`[checkTradingConditions] 💡 Логика: ${factColor} факт по ${newsItem.currency} → ${tradeAction} для ${tradingSystem.selectedPair}`);

  return tradeAction;
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
  console.log(`[processNewsData] 🔄 НАЧАЛО ОБРАБОТКИ НОВОСТНЫХ ДАННЫХ`);
  console.log(`[processNewsData] ⏰ Время: ${new Date().toLocaleTimeString()}`);
  
  // Проверка базовых условий
  const hasSelectedNews = !!tradingSystem.selectedNews;
  const hasNewsData = !!(newsData && Array.isArray(newsData));
  
  console.log(`[processNewsData] 🎯 Выбранная новость: ${hasSelectedNews ? 'ДА' : 'НЕТ'} (${tradingSystem.selectedNews?.event || 'отсутствует'})`);
  console.log(`[processNewsData] 📊 Данные новостей: ${hasNewsData ? 'ДА' : 'НЕТ'} (${newsData?.length || 0} элементов)`);

  if (!hasSelectedNews) {
    console.log(`[processNewsData] ❌ ПРЕКРАЩЕНО: Не выбрана новость для мониторинга`);
    return;
  }

  if (!hasNewsData) {
    console.log(`[processNewsData] ❌ ПРЕКРАЩЕНО: Отсутствуют новостные данные`);
    return;
  }

  // Поиск фокусной новости
  console.log(`[processNewsData] 🔍 Поиск новости: "${tradingSystem.selectedNews.event}" для валюты: ${tradingSystem.selectedNews.currency}`);
  
  const focusedNews = newsData.find(item => 
    item.event === tradingSystem.selectedNews.event && 
    item.currency === tradingSystem.selectedNews.currency
  );

  if (!focusedNews) {
    console.log(`[processNewsData] ❌ Фокусная новость не найдена в данных`);
    console.log(`[processNewsData] 🔍 Доступные новости:`, newsData.slice(0, 5).map(item => 
      `${item.event} (${item.currency}) - ${item.actual || '—'}`
    ));
    tradingSystem.lastProcessedFact = null;
    return;
  }

  console.log(`[processNewsData] ✅ Фокусная новость найдена:`, {
    event: focusedNews.event,
    currency: focusedNews.currency,
    actual: focusedNews.actual || '—',
    actualType: focusedNews.actualType || 'неизвестно',
    time: focusedNews.time
  });

  // Сохранение первоначального состояния
  const newsKey = `${focusedNews.event}_${focusedNews.currency}`;
  if (!tradingSystem.initialNewsStates[newsKey]) {
    console.log(`[processNewsData] 💾 Сохраняю первоначальное состояние новости: ${newsKey}`);
    saveInitialNewsState(focusedNews);
  } else {
    console.log(`[processNewsData] 📋 Первоначальное состояние уже сохранено для: ${newsKey}`);
  }

  // Проверка наличия актуального факта
  const hasActualFact = !!(focusedNews.actual && focusedNews.actual !== "—");
  console.log(`[processNewsData] 📊 Наличие актуального факта: ${hasActualFact ? 'ДА' : 'НЕТ'} (${focusedNews.actual || '—'})`);

  if (!hasActualFact) {
    console.log(`[processNewsData] ⏳ Ожидание публикации факта...`);
    tradingSystem.lastProcessedFact = null;
    return;
  }

  // Проверка на дублирование обработки
  const factKey = `${focusedNews.actual}-${focusedNews.actualType}`;
  const isDuplicate = (factKey === tradingSystem.lastProcessedFact);
  
  console.log(`[processNewsData] 🔑 Ключ факта: ${factKey}`);
  console.log(`[processNewsData] 📋 Последний обработанный факт: ${tradingSystem.lastProcessedFact || 'отсутствует'}`);
  console.log(`[processNewsData] 🔄 Дублирование: ${isDuplicate ? 'ДА' : 'НЕТ'}`);

  if (isDuplicate) {
    console.log(`[processNewsData] ⏭️ ПРОПУСК: Факт уже обработан`);
    return;
  }

  // Обновление последнего обработанного факта
  tradingSystem.lastProcessedFact = factKey;
  console.log(`[processNewsData] ✅ Обновлен последний обработанный факт: ${factKey}`);

  // Проверка торговых условий
  console.log(`[processNewsData] 🎯 Проверка торговых условий...`);
  const tradeAction = checkTradingConditions(focusedNews);
  
  if (tradeAction) {
    console.log(`[processNewsData] 🚀 ЗАПУСК ТОРГОВОЙ ОПЕРАЦИИ: ${tradeAction.toUpperCase()}`);
    executeTrade(tradeAction, focusedNews);
  } else {
    console.log(`[processNewsData] ❌ Торговые условия не выполнены, операция отменена`);
  }

  console.log(`[processNewsData] ✅ ОБРАБОТКА ЗАВЕРШЕНА`);
}

// Активация торговой системы
function activateTradingSystem(newsSelection, asset, pair) {
  console.log(`[activateTradingSystem] 🟢 АКТИВАЦИЯ ТОРГОВОЙ СИСТЕМЫ`);
  console.log(`[activateTradingSystem] ⏰ Время активации: ${new Date().toLocaleTimeString()}`);
  console.log(`[activateTradingSystem] 📰 Выбранная новость:`, newsSelection);
  console.log(`[activateTradingSystem] 💱 Актив: ${asset}`);
  console.log(`[activateTradingSystem] 📈 Валютная пара: ${pair}`);

  tradingSystem.isActive = true;
  tradingSystem.selectedNews = newsSelection;
  tradingSystem.selectedAsset = asset;
  tradingSystem.selectedPair = pair;
  tradingSystem.startTime = Date.now();

  console.log(`[activateTradingSystem] 📊 Торговая система настроена:`, {
    isActive: tradingSystem.isActive,
    selectedNews: tradingSystem.selectedNews?.event,
    selectedAsset: tradingSystem.selectedAsset,
    selectedPair: tradingSystem.selectedPair,
    startTime: new Date(tradingSystem.startTime).toLocaleTimeString()
  });

  // Сохранение состояния
  const stateToSave = {
    tradingSystemActive: true,
    tradingSystemState: {
      selectedNews: newsSelection,
      selectedAsset: asset,
      selectedPair: pair,
      startTime: tradingSystem.startTime
    }
  };
  
  console.log(`[activateTradingSystem] 💾 Сохраняю состояние:`, stateToSave);
  chrome.storage.local.set(stateToSave);

  // Запуск мониторинга
  if (tradingSystem.monitoringInterval) {
    console.log(`[activateTradingSystem] 🔄 Останавливаю предыдущий интервал мониторинга`);
    clearInterval(tradingSystem.monitoringInterval);
  }

  console.log(`[activateTradingSystem] ⏱️ Запускаю мониторинг новостей (каждую секунду)`);
  console.log(`[activateTradingSystem] ⏳ Максимальное время работы: ${tradingSystem.MAX_TRADING_TIME / (60 * 60 * 1000)} часов`);

  tradingSystem.monitoringInterval = setInterval(() => {
    // Проверка таймаута
    const runTime = Date.now() - tradingSystem.startTime;
    if (runTime > tradingSystem.MAX_TRADING_TIME) {
      console.log(`[activateTradingSystem-Monitor] ⏰ ТАЙМАУТ: Превышено максимальное время работы (${runTime / (60 * 60 * 1000)} часов)`);
      deactivateTradingSystem("Превышено максимальное время работы");
      return;
    }

    // Логируем каждые 10 секунд для отслеживания работы
    if (Math.floor(runTime / 1000) % 10 === 0) {
      console.log(`[activateTradingSystem-Monitor] 🔄 Мониторинг активен, время работы: ${Math.floor(runTime / 1000)} секунд`);
    }

    // Обновление новостей и обработка
    updateNewsData();
  }, 1000);

  // Запуск авто-клика
  console.log(`[activateTradingSystem] 🔄 Запускаю авто-клик по кнопке 'Сегодня'`);
  startAutoClick();

  console.log(`[activateTradingSystem] ✅ ТОРГОВАЯ СИСТЕМА УСПЕШНО АКТИВИРОВАНА`);
}

// Деактивация торговой системы
function deactivateTradingSystem(reason = "Отключено вручную") {
  console.log(`[deactivateTradingSystem] 🔴 ДЕАКТИВАЦИЯ ТОРГОВОЙ СИСТЕМЫ`);
  console.log(`[deactivateTradingSystem] ⏰ Время деактивации: ${new Date().toLocaleTimeString()}`);
  console.log(`[deactivateTradingSystem] 📝 Причина: ${reason}`);
  
  if (tradingSystem.startTime) {
    const runTime = Date.now() - tradingSystem.startTime;
    console.log(`[deactivateTradingSystem] ⏱️ Время работы системы: ${Math.floor(runTime / 1000)} секунд (${Math.floor(runTime / 60000)} минут)`);
  }

  console.log(`[deactivateTradingSystem] 📊 Состояние системы перед отключением:`, {
    isActive: tradingSystem.isActive,
    selectedNews: tradingSystem.selectedNews?.event || 'отсутствует',
    selectedAsset: tradingSystem.selectedAsset || 'отсутствует',
    selectedPair: tradingSystem.selectedPair || 'отсутствует',
    hasMonitoringInterval: !!tradingSystem.monitoringInterval,
    hasAutoClickInterval: !!tradingSystem.autoClickInterval
  });

  tradingSystem.isActive = false;
  
  if (tradingSystem.monitoringInterval) {
    console.log(`[deactivateTradingSystem] 🔄 Останавливаю интервал мониторинга`);
    clearInterval(tradingSystem.monitoringInterval);
    tradingSystem.monitoringInterval = null;
  } else {
    console.log(`[deactivateTradingSystem] ⚠️ Интервал мониторинга не был активен`);
  }

  console.log(`[deactivateTradingSystem] 🔄 Останавливаю авто-клик`);
  stopAutoClick();

  // Сохранение состояния
  const stateToSave = {
    tradingSystemActive: false,
    tradingSystemState: null
  };
  
  console.log(`[deactivateTradingSystem] 💾 Сохраняю состояние деактивации:`, stateToSave);
  chrome.storage.local.set(stateToSave);

  // Уведомление об отключении
  console.log(`[deactivateTradingSystem] 🔔 Отправляю уведомление о деактивации`);
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: 'DK NEWS HUNTERS',
    message: `Торговая система отключена: ${reason}`
  });

  console.log(`[deactivateTradingSystem] ✅ ТОРГОВАЯ СИСТЕМА УСПЕШНО ДЕАКТИВИРОВАНА: ${reason}`);
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

// Обновление данных новостей - исправленная версия
function updateNewsData() {
  const investingUrl = "https://ru.investing.com/economic-calendar/";

  const handleResult = (tabId) => {
    chrome.scripting.executeScript({
      target: { tabId },
      func: extractNewsData
    }, (results) => {
      if (chrome.runtime.lastError) {
        console.error('Ошибка при выполнении скрипта:', chrome.runtime.lastError);
        return;
      }
      
      if (results && results[0] && results[0].result) {
        console.log('Данные новостей успешно получены');
        chrome.storage.local.set({ newsData: results[0].result });
        
        if (tradingSystem.isActive) {
          processNewsData(results[0].result);
        }
      } else {
        console.error('Не удалось получить данные новостей');
      }
    });
  };

  // Сначала ищем открытую вкладку Investing.com
  chrome.tabs.query({ url: investingUrl + "*" }, (tabs) => {
    if (tabs && tabs.length > 0) {
      console.log('Найдена открытая вкладка Investing.com, используем ее');
      handleResult(tabs[0].id);
    } else {
      console.log('Вкладка Investing.com не найдена, создаем новую');
      chrome.tabs.create({ 
        url: investingUrl, 
        active: false 
      }, (newTab) => {
        // Добавляем обработчик для ожидания загрузки страницы
        const onUpdatedListener = (tabId, changeInfo) => {
          if (tabId === newTab.id && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(onUpdatedListener);
            console.log('Вкладка Investing.com загружена, получаем данные');
            handleResult(tabId);
          }
        };
        
        chrome.tabs.onUpdated.addListener(onUpdatedListener);
      });
    }
  });
}

// Обработчик сообщений
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "openInvesting") {
    console.log('Получен запрос на открытие Investing.com');
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

// Функция для извлечения данных новостей - исправленная версия
function extractNewsData() {
  try {
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
  } catch (error) {
    console.error('Ошибка в extractNewsData:', error);
    return [];
  }
}
