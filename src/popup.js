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
let processedNews = {};
let tradingSystemActive = false;
let autoUpdateActive = false; // Добавлено новое состояние для автообновления

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
// ОСНОВНЫЕ ФУНКЦИИ
// ============================================================================

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
            return true;
          }
          return false;
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

function getColorFromType(type) {
  switch (type) {
    case 'GFP': return 'green';
    case 'RFP': return 'red';
    case 'BFP': return 'black';
    default: return 'black';
  }
}

function isNewsProcessed(newsItem) {
  if (!newsItem) return true;
  const key = `${newsItem.event}_${newsItem.currency}_${newsItem.actual}`;
  return processedNews[key] || false;  
}

// ============================================================================
// ФУНКЦИИ ДЛЯ РАБОТЫ С BID И АВТОРИЗАЦИЕЙ
// ============================================================================

async function attemptGetBID() {
  return new Promise((resolve) => {
    chrome.tabs.query({ url: "*://*/*" }, async (tabs) => {
      console.log('[Popup] Проверка вкладок на предмет брокерских сайтов');
      
      const brokerTabs = [];
      
      for (const tab of tabs) {
        if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
          continue;
        }
        
        try {
          const results = await new Promise((tabResolve) => {
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: checkBrokerMeta
            }, (results) => {
              if (chrome.runtime.lastError) {
                tabResolve(false);
              } else {
                tabResolve(results && results[0] && results[0].result);
              }
            });
          });
          
          if (results) brokerTabs.push(tab);
        } catch (error) {
          console.log('[Popup] Ошибка при проверке вкладки', error);
        }
      }

      if (brokerTabs.length === 0) {
        resolve(null);
        return;
      }

      chrome.scripting.executeScript({
        target: { tabId: brokerTabs[0].id },
        func: () => {
          const divElement = document.querySelector('.info__id');
          if (divElement) {
            const childWithDataHdShow = Array.from(divElement.children).find(child => child.hasAttribute('data-hd-show'));
            if (childWithDataHdShow) {
              const bid = childWithDataHdShow.getAttribute('data-hd-show');
              return bid ? bid.replace('id ', '') : null;
            }
          }
          return null;
        }
      }, (results) => {
        resolve(results && results[0] ? results[0].result : null);
      });
    });
  });
}

function logout(reason = "Подписка истекла") {
  chrome.storage.local.remove(["authToken", "expected_bid"], () => {
    showLogin();
    document.getElementById("loginError").textContent = `${reason}. Войдите снова.`;
  });
}

async function verifySubscription(token) {
  try {
    let { USER_BID } = await chrome.storage.local.get("USER_BID");
    
    if (!USER_BID) {
      USER_BID = await attemptGetBID();
      if (USER_BID) {
        chrome.storage.local.set({ expected_bid: USER_BID });
      }
    }
    
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ token, bid: USER_BID })
    });
    
    if (!response) {
      console.error("Не удалось получить ответ от сервера");
      return true;
    }
    
    const data = await response.json();
    
    if (!data.success || !data.subscriptionActive) {
      logout(data.message || "Подписка неактивна или истекла");
      return false;
    }
    
    const { expected_bid } = await chrome.storage.local.get("expected_bid");
    
    if (!USER_BID) {
      if (document.getElementById("statusBar") && document.getElementById("mainSection").style.display !== "none") {
        document.getElementById("statusBar").textContent = "BID не получен! Откройте страницу брокера.";
      }
      return true;
    }
    
    if (expected_bid && USER_BID && expected_bid !== USER_BID) {
      logout("Обнаружена смена пользователя");
      return false;
    }
    
    return true;
  } catch (error) {
    console.error("Ошибка при проверке подписки:", error);
    return true;
  }
}

// ============================================================================
// ФУНКЦИИ УПРАВЛЕНИЯ UI
// ============================================================================

function showLogin() {
  document.getElementById("loginSection").style.display = "";
  document.getElementById("mainSection").style.display = "none";
}

function showMain() {
  document.getElementById("loginSection").style.display = "none";
  document.getElementById("mainSection").style.display = "";
}

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

async function selectCurrencyPairOnPage(pair) {
  if (!pair) return false;
  
  const mainSelectorClicked = await clickElement('a.pair-number-wrap');
  if (!mainSelectorClicked) return false;

  await new Promise(resolve => setTimeout(resolve, 500));
  
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
        resolve(results && results[0] && results[0].result);
      });
    });
  });
  
  return pairElements;
}

function renderNews(newsList) {
  const container = document.getElementById("newsContainer");
  container.innerHTML = "";

  if (!newsList || !Array.isArray(newsList) || newsList.length === 0) {
    container.textContent = "Загрузка данных...";
    return;
  }

  newsList.forEach(item => {
    const div = document.createElement("div");
    div.className = "news-item";
    div.dataset.currency = item.currency;
    div.dataset.event = item.event;

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
      selectedAsset = item.currency;
      updateStatusBar();
      document.querySelectorAll(".news-item").forEach(el => el.classList.remove("focused"));
      div.classList.add("focused");
      chrome.storage.local.set({ selectedNews, selectedAsset });
      populatePairSelect(selectedAsset);
    });

    container.appendChild(div);
  });

  updateFocusedNews();
}

function updateFocusedNews() {
  if (selectedNews) {
    document.querySelectorAll(".news-item").forEach(el => {
      if (el.dataset.currency === selectedNews.currency && el.dataset.event === selectedNews.event) {
        el.classList.add("focused");
      }
    });
  }
}

function updateStatusBar() {
  const statusBar = document.getElementById("statusBar");
  if (!statusBar) return;
  
  if (selectedNews) {
    statusBar.textContent = `Фокусируем: ${selectedNews.event}`;
  } else if (tradingSystemActive) {
    statusBar.textContent = "✅ Торговая система активна";
  } else {
    statusBar.textContent = "❌ Торговая система не активна";
  }
}

function updateToggleStates() {
  const tradingToggle = document.getElementById("autoClickToggle");
  const updateToggle = document.getElementById("autoUpdateToggle");
  
  if (tradingToggle) tradingToggle.checked = tradingSystemActive;
  if (updateToggle) updateToggle.checked = autoUpdateActive;
}

// ============================================================================
// ФУНКЦИИ РАБОТЫ С BACKGROUND
// ============================================================================

function updateExtension() {
  chrome.runtime.sendMessage({ action: "openInvesting" }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Ошибка связи с background:', chrome.runtime.lastError);
      document.getElementById("statusBar").textContent = "❌ Ошибка обновления данных";
      return;
    }
    
    if (response?.success) {
      console.log('Данные запрошены успешно');
    } else {
      console.error('Не удалось обновить данные');
      document.getElementById("statusBar").textContent = "❌ Ошибка обновления данных";
    }
  });
}

function testBackgroundConnection() {
  chrome.runtime.sendMessage({ action: "getTradingState" }, (response) => {
    if (chrome.runtime.lastError) {
      document.getElementById("statusBar").textContent = "❌ Ошибка связи с background";
      return;
    }
    
    if (response) {
      updateStatusBar();
    }
  });
}

function syncTradingSystemState() {
  chrome.runtime.sendMessage({ action: "getTradingState" }, (response) => {
    if (chrome.runtime.lastError) {
      document.getElementById("statusBar").textContent = "Ошибка получения состояния";
      return;
    }
    
    if (response) {
      tradingSystemActive = response.isActive;
      autoUpdateActive = response.autoUpdateActive || false;
      updateToggleStates();
      updateStatusBar();
    }
  });
}

function initializeStoredData() {
  chrome.storage.local.get(
    ["newsData", "selectedNews", "selectedAsset", "selectedPair", "processedNews", "tradingSystemActive", "autoUpdateActive"], 
    (result) => {
      if (result.processedNews) processedNews = result.processedNews;
      if (result.newsData) renderNews(result.newsData);
      if (result.selectedNews) selectedNews = result.selectedNews;

      if (result.selectedAsset) {
        selectedAsset = result.selectedAsset;
        populatePairSelect(selectedAsset);
      }

      if (result.selectedPair) {
        selectedPair = result.selectedPair;
        const pairSelect = document.getElementById("pairSelect");
        if (pairSelect) pairSelect.value = selectedPair;
      }

      if (typeof result.tradingSystemActive === 'boolean') {
        tradingSystemActive = result.tradingSystemActive;
      }

      if (typeof result.autoUpdateActive === 'boolean') {
        autoUpdateActive = result.autoUpdateActive;
      }

      updateToggleStates();
      updateStatusBar();
      updateFocusedNews();
    }
  );
}

// ============================================================================
// ОБРАБОТЧИКИ СОБЫТИЙ
// ============================================================================

document.getElementById("loginButton")?.addEventListener("click", async () => {
  const login = document.getElementById("loginInput").value.trim();
  const password = document.getElementById("passwordInput").value.trim();
  const errorElement = document.getElementById("loginError");
  errorElement.textContent = "";
  
  if (!login || !password) {
    errorElement.textContent = "Введите логин и пароль";
    return;
  }

  let { USER_BID } = await chrome.storage.local.get("USER_BID");
  
  if (!USER_BID) {
    errorElement.textContent = "Получение BID с сайта брокера...";
    USER_BID = await attemptGetBID();
    
    if (!USER_BID) {
      errorElement.textContent = "Не удалось получить BID. Откройте страницу брокера!";
      return;
    }
  }

  try {
    const res = await fetch(SERVER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login, password, bid: USER_BID })
    });
    const data = await res.json();
    
    if (data.success && data.token) {
      chrome.storage.local.set({ 
        authToken: data.token,
        expected_bid: USER_BID
      }, () => {
        showMain();
        initializeStoredData();
        syncTradingSystemState();
      });
    } else {
      errorElement.textContent = data.message || "Неверный логин или пароль";
    }
  } catch (e) {
    errorElement.textContent = "Ошибка соединения с сервером";
  }
});

document.getElementById("buyButton")?.addEventListener("click", async () => {
  const result = await clickElement(".action-high-low.button-call-wrap a.btn.btn-call");
  document.getElementById("statusBar").textContent = result 
    ? "Ручная покупка выполнена" 
    : "Ошибка при покупке";
});

document.getElementById("sellButton")?.addEventListener("click", async () => {
  const result = await clickElement(".action-high-low.button-put-wrap a.btn.btn-put");
  document.getElementById("statusBar").textContent = result 
    ? "Ручная продажа выполнена" 
    : "Ошибка при продаже";
});

document.getElementById("autoClickToggle")?.addEventListener("change", function(e) {
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
      if (response?.success) {
        tradingSystemActive = true;
        chrome.storage.local.set({ tradingSystemActive: true });
        updateStatusBar();
      } else {
        e.target.checked = false;
        document.getElementById("statusBar").textContent = "Ошибка активации";
      }
    });
  } else {
    document.getElementById("statusBar").textContent = "Отключение торговой системы...";
    chrome.runtime.sendMessage({ action: "deactivateTrading" }, (response) => {
      if (response?.success) {
        tradingSystemActive = false;
        chrome.storage.local.set({ tradingSystemActive: false });
        updateStatusBar();
      }
    });
  }
});

document.getElementById("autoUpdateToggle")?.addEventListener("change", function(e) {
  autoUpdateActive = e.target.checked;
  chrome.storage.local.set({ autoUpdateActive });
  
  chrome.runtime.sendMessage({
    action: "toggleAutoUpdate",
    state: autoUpdateActive
  }, (response) => {
    if (!response?.success) {
      autoUpdateActive = !autoUpdateActive;
      e.target.checked = autoUpdateActive;
      chrome.storage.local.set({ autoUpdateActive });
      document.getElementById("statusBar").textContent = "Ошибка изменения состояния автообновления";
    }
  });
});

document.getElementById("pairSelect")?.addEventListener("change", async (e) => {
  selectedPair = e.target.value;
  chrome.storage.local.set({ selectedPair });
  if (selectedPair) await selectCurrencyPairOnPage(selectedPair);
});

document.getElementById("statusBar")?.addEventListener("click", () => {
  if (selectedNews) {
    const el = Array.from(document.querySelectorAll(".news-item")).find(
      e => e.dataset.currency === selectedNews.currency && e.dataset.event === selectedNews.event
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("focused");
    }
  }
});

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================================

window.addEventListener('load', () => {
  console.log('[Popup] Инициализация...');
  
  initializeStoredData();
  testBackgroundConnection();
  syncTradingSystemState();
  
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      if (changes.newsData) {
        console.log('Обновление данных новостей');
        renderNews(changes.newsData.newValue);
      }
      
      if (changes.processedNews) {
        processedNews = changes.processedNews.newValue;
      }
      
      if (changes.tradingSystemActive) {
        tradingSystemActive = changes.tradingSystemActive.newValue;
        updateToggleStates();
        updateStatusBar();
      }
      
      if (changes.autoUpdateActive) {
        autoUpdateActive = changes.autoUpdateActive.newValue;
        updateToggleStates();
      }
      
      if (changes.selectedNews) {
        selectedNews = changes.selectedNews.newValue;
        updateStatusBar();
        updateFocusedNews();
      }
    }
  });
  
  // Первоначальный запрос данных
  updateExtension();
});

chrome.storage.local.get("authToken", async (result) => {
  if (result.authToken) {
    showMain();
    await verifySubscription(result.authToken);
  } else {
    showLogin();
  }
});

setInterval(async () => {
  chrome.storage.local.get("authToken", async (result) => {
    if (result.authToken) {
      await verifySubscription(result.authToken);
    }
  });
}, 5 * 60 * 1000);

// Функция для проверки брокерских мета-данных (используется в attemptGetBID)
function checkBrokerMeta() {
  try {
    const themeColorMeta = document.querySelector('meta[name="theme-color"][content="#1F1F23"]');
    const colorSchemesMeta = document.querySelector('meta[name="supported-color-schemes"][content="light dark"]');
    return !!(themeColorMeta && colorSchemesMeta);
  } catch (error) {
    console.error('Ошибка при проверке мета-данных:', error);
    return false;
  }
}