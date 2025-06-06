// popup.js
let selectedNews = null;
let selectedAsset = "";
let selectedPair = "";
let lastProcessedFact = null;
let processedNews = {}; // Для отслеживания обработанных новостей
let initialNewsStates = {}; // Для хранения начального состояния новостей
let autoClickInterval = null; // Для хранения интервала авто-кликов

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
  }
};

const PAIRS = {};
for (const asset in TRADING_RULES) {
  PAIRS[asset] = {};
  for (const pair in TRADING_RULES[asset]) {
    PAIRS[asset][pair] = {};
  }
}

// Функция для клика по элементам
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

// Новая функция для выбора валютной пары на странице
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

// Проверяем, была ли новость уже обработана
function isNewsProcessed(newsItem) {
  if (!newsItem) return true;
  const key = `${newsItem.event}_${newsItem.currency}_${newsItem.actual}`;
  return processedNews[key] || false;
}

// Помечаем новость как обработанную
function markNewsAsProcessed(newsItem) {
  if (!newsItem) return;
  const key = `${newsItem.event}_${newsItem.currency}_${newsItem.actual}`;
  processedNews[key] = true;
  chrome.storage.local.set({ processedNews });
}

// Сохраняем начальное состояние новости
function saveInitialNewsState(newsItem) {
  if (!newsItem) return;
  const key = `${newsItem.event}_${newsItem.currency}`;
  initialNewsStates[key] = {
    hasFact: newsItem.actual && newsItem.actual !== "—",
    factType: newsItem.actualType
  };
}

// Проверяем, было ли изначально факта в новости
function hadFactInitially(newsItem) {
  if (!newsItem) return true;
  const key = `${newsItem.event}_${newsItem.currency}`;
  return initialNewsStates[key]?.hasFact || false;
}

// Обработчики для кнопок Купить/Продать
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

async function executeTrade(action, newsItem) {
  if (isNewsProcessed(newsItem)) {
    console.log("Эта новость уже обработана, пропускаем");
    return false;
  }

  const selector = action === "buy" 
    ? ".action-high-low.button-call-wrap a.btn.btn-call" 
    : ".action-high-low.button-put-wrap a.btn.btn-put";
  
  const result = await clickElement(selector);
  if (result) {
    console.log(`Выполнена ${action === "buy" ? "покупка" : "продажа"}`);
    markNewsAsProcessed(newsItem);
    document.getElementById("statusBar").textContent = 
      `Авто-торговля: ${action === "buy" ? "Покупка" : "Продажа"} (${selectedAsset}/${selectedPair})`;
    return true;
  }
  return false;
}

function checkTradingConditions(newsItem) {
  // Проверяем базовые условия
  if (!selectedNews || !selectedAsset || !selectedPair || !newsItem.actual || newsItem.actual === "—") {
    return false;
  }

  // Проверяем, была ли новость уже обработана
  if (isNewsProcessed(newsItem)) {
    return false;
  }

  // Проверяем, был ли факт изначально
  if (hadFactInitially(newsItem)) {
    return false;
  }

  const factColor = newsItem.actualType;
  if (factColor !== 'GFP' && factColor !== 'RFP') {
    return false;
  }

  const factKey = factColor === 'GFP' ? 'green' : 'red';
  const tradingPair = TRADING_RULES[selectedAsset]?.[selectedPair];
  
  if (!tradingPair || !tradingPair[factKey]) {
    return false;
  }

  return tradingPair[factKey];
}

function processNewsData(newsData) {
  if (!selectedNews || !newsData || !Array.isArray(newsData)) return;

  const focusedNews = newsData.find(item => 
    item.event === selectedNews.event && 
    item.currency === selectedNews.currency
  );

  if (!focusedNews) {
    lastProcessedFact = null;
    return;
  }

  // Сохраняем начальное состояние при первом обнаружении новости
  const newsKey = `${focusedNews.event}_${focusedNews.currency}`;
  if (!initialNewsStates[newsKey]) {
    saveInitialNewsState(focusedNews);
  }

  if (!focusedNews.actual || focusedNews.actual === "—") {
    lastProcessedFact = null;
    return;
  }

  const factKey = `${focusedNews.actual}-${focusedNews.actualType}`;
  if (factKey === lastProcessedFact) return;

  lastProcessedFact = factKey;
  const tradeAction = checkTradingConditions(focusedNews);
  
  if (tradeAction) {
    executeTrade(tradeAction, focusedNews);
  }
}

function renderNews(newsList) {
  const container = document.getElementById("newsContainer");
  container.innerHTML = "";

  if (!newsList || !Array.isArray(newsList) || newsList.length === 0) {
    container.textContent = "Нет данных или не удалось загрузить.";
    return;
  }

  processNewsData(newsList);

  newsList.forEach(item => {
    const div = document.createElement("div");
    div.className = "news-item";
    div.dataset.currency = item.currency;
    div.dataset.event = item.event;

    // Добавляем класс для обработанных новостей
    if (isNewsProcessed(item)) {
      div.classList.add("processed");
    }

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

    div.appendChild(time);
    div.appendChild(currency);
    div.appendChild(event);
    div.appendChild(importance);
    div.appendChild(actual);
    div.appendChild(forecast);
    div.appendChild(previous);

    div.addEventListener("click", () => {
      selectedNews = { event: item.event, currency: item.currency };
      document.getElementById("statusBar").textContent = `Фокусируем: ${item.event}`;
      document.querySelectorAll(".news-item").forEach(el => el.classList.remove("focused"));
      div.classList.add("focused");
      chrome.storage.local.set({ selectedNews });
      
      // Сохраняем начальное состояние при фокусировке
      saveInitialNewsState(item);
    });

    container.appendChild(div);
  });

  if (selectedNews) {
    document.querySelectorAll(".news-item").forEach(el => {
      if (el.dataset.currency === selectedNews.currency && el.dataset.event === selectedNews.event) {
        el.classList.add("focused");
      }
    });
    document.getElementById("statusBar").textContent = `Фокусируем: ${selectedNews.event}`;
  }
}

function getColorFromType(type) {
  switch (type) {
    case 'GFP': return 'green';
    case 'RFP': return 'red';
    case 'BFP': return 'black';
    default: return 'black';
  }
}

function updateExtension() {
  chrome.runtime.sendMessage({ action: "openInvesting" }, (response) => {
    if (response?.success) {
      chrome.storage.local.get(["newsData", "processedNews"], (result) => {
        if (result.newsData) {
          renderNews(result.newsData);
          processNewsData(result.newsData);
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

function populateAssetSelect() {
  const assetSelect = document.getElementById("assetSelect");
  assetSelect.innerHTML = '<option value="">Выбор актива</option>';
  
  for (const asset in PAIRS) {
    const option = document.createElement("option");
    option.value = asset;
    option.textContent = asset;
    assetSelect.appendChild(option);
  }
}

function populatePairSelect(asset) {
  const pairSelect = document.getElementById("pairSelect");
  pairSelect.innerHTML = '<option value="">Валютная пара</option>';

  if (PAIRS[asset]) {
    pairSelect.disabled = false;
    for (const pair in PAIRS[asset]) {
      const option = document.createElement("option");
      option.value = pair;
      option.textContent = pair;
      pairSelect.appendChild(option);
    }
  } else {
    pairSelect.disabled = true;
  }
}

const SERVER_URL = "http://176.108.253.203:8000/login";
const VERIFY_URL = "http://176.108.253.203:8000/verify";

function showLogin() {
  document.getElementById("loginSection").style.display = "";
  document.getElementById("mainSection").style.display = "none";
}

function showMain() {
  document.getElementById("loginSection").style.display = "none";
  document.getElementById("mainSection").style.display = "";
}

// Функция для выхода из системы
function logout() {
  chrome.storage.local.remove(["authToken"], () => {
    showLogin();
    document.getElementById("loginError").textContent = "Подписка истекла. Войдите снова.";
  });
}

// Функция проверки статуса подписки
async function verifySubscription(token) {
  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ token })
    });
    
    // Если ответ не получен (например, timeout)
    if (!response) {
      console.error("Не удалось получить ответ от сервера");
      return true; // Сохраняем текущее состояние
    }
    
    const data = await response.json();
    
    if (!data.success || !data.subscriptionActive) {
      console.log("Подписка неактивна или истекла");
      logout();
      return false;
    }
    
    return true;
  } catch (error) {
    console.error("Ошибка при проверке подписки:", error);
    // В случае любой ошибки (сети, парсинга и т.д.) сохраняем текущее состояние
    return true;
  }
}

// Проверка токена и подписки при запуске
chrome.storage.local.get("authToken", async (result) => {
  if (result.authToken) {
    // Сразу показываем рабочее меню
    showMain();
    // Параллельно проверяем подписку
    const isValid = await verifySubscription(result.authToken);
    if (!isValid) {
      // Если подписка неактивна, logout() уже вызван в verifySubscription
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
}, 5 * 60 * 1000); // 5 минут

// Обработчик кнопки входа
document.getElementById("loginButton")?.addEventListener("click", async () => {
  const login = document.getElementById("loginInput").value.trim();
  const password = document.getElementById("passwordInput").value.trim();
  document.getElementById("loginError").textContent = "";

  if (!login || !password) {
    document.getElementById("loginError").textContent = "Введите логин и пароль";
    return;
  }

  try {
    const res = await fetch(SERVER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login, password })
    });
    const data = await res.json();
    if (data.success && data.token) {
      chrome.storage.local.set({ authToken: data.token }, () => {
        showMain();
        location.reload(); // Перезагрузить для инициализации расширения
      });
    } else {
      document.getElementById("loginError").textContent = "Неверный логин или пароль";
    }
  } catch (e) {
    document.getElementById("loginError").textContent = "Ошибка соединения с сервером";
  }
});

// ========== Функции для тумблера авто-клика ==========
document.getElementById("autoClickToggle").addEventListener("change", function(e) {
  if (e.target.checked) {
    startAutoClick();
    document.getElementById("statusBar").textContent = "Автообновление включено";
  } else {
    stopAutoClick();
    document.getElementById("statusBar").textContent = "Автообновление выключено";
  }
});

function startAutoClick() {
  clickTodayButton();
  autoClickInterval = setInterval(clickTodayButton, 15000);
}

function stopAutoClick() {
  if (autoClickInterval) {
    clearInterval(autoClickInterval);
    autoClickInterval = null;
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

// Остановить интервал при закрытии попапа
window.addEventListener('unload', () => {
  stopAutoClick();
});

// Инициализация
document.getElementById("assetSelect")?.addEventListener("change", (e) => {
  selectedAsset = e.target.value;
  populatePairSelect(selectedAsset);
  selectedPair = "";
  chrome.storage.local.set({ selectedAsset, selectedPair });
});

document.getElementById("pairSelect")?.addEventListener("change", async (e) => {
  selectedPair = e.target.value;
  chrome.storage.local.set({ selectedPair });
  
  // Вызываем функцию для выбора пары на странице
  if (selectedPair) {
    await selectCurrencyPairOnPage(selectedPair);
  }
});

// Загрузка сохраненных данных
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
      document.getElementById("assetSelect").value = selectedAsset;
      populatePairSelect(selectedAsset);
    }

    if (result.selectedPair) {
      selectedPair = result.selectedPair;
      document.getElementById("pairSelect").value = selectedPair;
    }
  }
);

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

// Периодическое обновление данных
setInterval(updateExtension, 1000);

// Первоначальная загрузка
populateAssetSelect();
updateExtension();