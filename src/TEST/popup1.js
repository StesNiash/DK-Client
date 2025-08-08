// popup.js - UI логика и взаимодействие с background script
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

// Функция для рендеринга новостей
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
      document.getElementById("statusBar").textContent = `Фокусируем: ${item.event}`;
      document.querySelectorAll(".news-item").forEach(el => el.classList.remove("focused"));
      div.classList.add("focused");
      chrome.storage.local.set({ selectedNews, selectedAsset });
      
      // Обновляем список пар для выбранного актива
      populatePairSelect(selectedAsset);
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

// Функция для проверки связи с background script  
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

// Функция для синхронизации состояния торговой системы
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

// ========== Функции для тумблера торговой системы ==========
document.getElementById("autoClickToggle").addEventListener("change", function(e) {
  console.log('[Popup] Переключатель изменен:', e.target.checked);
  
  if (e.target.checked) {
    // Проверяем, что выбрана новость и пара
    console.log('[Popup] Проверка данных:', { selectedNews, selectedAsset, selectedPair });
    
    if (!selectedNews || !selectedAsset || !selectedPair) {
      e.target.checked = false;
      document.getElementById("statusBar").textContent = "Выберите новость и валютную пару";
      console.log('[Popup] Данные не выбраны');
      return;
    }
    
    console.log('[Popup] Отправка сообщения активации торговой системы');
    document.getElementById("statusBar").textContent = "Активация торговой системы...";
    
    // Активируем торговую систему
    chrome.runtime.sendMessage({
      action: "activateTrading",
      selectedNews: selectedNews,
      selectedAsset: selectedAsset,
      selectedPair: selectedPair
    }, (response) => {
      console.log('[Popup] Ответ от background:', response);
      
      if (chrome.runtime.lastError) {
        console.error('[Popup] Ошибка runtime:', chrome.runtime.lastError);
        e.target.checked = false;
        document.getElementById("statusBar").textContent = "Ошибка соединения с background script";
        return;
      }
      
      if (response?.success) {
        tradingSystemActive = true;
        document.getElementById("statusBar").textContent = "Торговая система активирована";
        console.log('[Popup] Торговая система успешно активирована');
      } else {
        e.target.checked = false;
        document.getElementById("statusBar").textContent = "Ошибка активации торговой системы";
        console.error('[Popup] Ошибка активации:', response);
      }
    });
  } else {
    console.log('[Popup] Деактивация торговой системы');
    document.getElementById("statusBar").textContent = "Отключение торговой системы...";
    
    // Деактивируем торговую систему
    chrome.runtime.sendMessage({ action: "deactivateTrading" }, (response) => {
      console.log('[Popup] Ответ на деактивацию:', response);
      
      if (chrome.runtime.lastError) {
        console.error('[Popup] Ошибка runtime при деактивации:', chrome.runtime.lastError);
      }
      
      if (response?.success) {
        tradingSystemActive = false;
        document.getElementById("statusBar").textContent = "Торговая система отключена";
        console.log('[Popup] Торговая система успешно отключена');
      } else {
        console.error('[Popup] Ошибка деактивации:', response);
        document.getElementById("statusBar").textContent = "Ошибка отключения торговой системы";
      }
    });
  }
});

// Обновление состояния тумблера при открытии popup
window.addEventListener('load', () => {
  console.log('[Popup] Popup загружен, инициализация...');
  
  // Сначала тестируем связь с background
  testBackgroundConnection();
  
  // Затем синхронизируем состояние
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
          console.log('[Popup] Состояние переключателя обновлено из storage:', changes.tradingSystemActive.newValue);
        }
      }
    }
  });
});

// Авторизация и сервер
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

// Функция для выхода из системы с указанием причины
function logout(reason = "Подписка истекла") {
  chrome.storage.local.remove(["authToken", "expected_bid"], () => {
    showLogin();
    document.getElementById("loginError").textContent = `${reason}. Войдите снова.`;
  });
}

// Функция проверки статуса подписки
async function verifySubscription(token) {
  try {
    const { USER_BID } = await chrome.storage.local.get("USER_BID");
    
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
      console.log("BID не найден, но не разлогиниваем пользователя");
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
  
  // Проверка наличия BID (Broker ID)
  const { USER_BID } = await chrome.storage.local.get("USER_BID");
  if (!USER_BID) {
    document.getElementById("loginError").textContent = 
      "Откройте страницу брокера для получения BID!";
    return;
  }

  if (!login || !password) {
    document.getElementById("loginError").textContent = "Введите логин и пароль";
    return;
  }

  try {
    const res = await fetch(SERVER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        login, 
        password,
        bid: USER_BID  // Отправляем BID на сервер
      })
    });
    const data = await res.json();
    if (data.success && data.token) {
      // Сохраняем BID как ожидаемый для будущих проверок
      chrome.storage.local.set({ 
        authToken: data.token,
        expected_bid: USER_BID
      }, () => {
        showMain();
        // Инициализация без перезагрузки
        updateExtension();
        initializeStoredData();
        syncTradingSystemState();
      });
    } else {
      document.getElementById("loginError").textContent = "Неверный логин или пароль";
    }
  } catch (e) {
    document.getElementById("loginError").textContent = "Ошибка соединения с сервером";
  }
});

// Инициализация сохраненных данных
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

// Инициализация селектора валютной пары
document.getElementById("pairSelect")?.addEventListener("change", async (e) => {
  selectedPair = e.target.value;
  chrome.storage.local.set({ selectedPair });
  
  // Вызываем функцию для выбора пары на странице
  if (selectedPair) {
    await selectCurrencyPairOnPage(selectedPair);
  }
});

// Обработчик клика по статус-бару (скролл к выбранной новости)
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

// Загрузка сохраненных данных при инициализации
initializeStoredData();

// Периодическое обновление данных (только для отображения, торговля теперь в background)
setInterval(updateExtension, 5000); // Снижено до 5 секунд, так как торговля в background

// Первоначальная загрузка
updateExtension();
