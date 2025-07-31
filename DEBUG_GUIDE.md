# DK NEWS HUNTERS - Руководство по отладке и тестированию

## 🔧 Инструменты для отладки

### 1. Debug Console (debug.html)
Специальная страница для тестирования всех функций расширения:
- Открыть: `chrome-extension://[ID_РАСШИРЕНИЯ]/debug.html`
- Ручное тестирование всех функций
- Просмотр логов в реальном времени
- Управление торговой системой

### 2. Browser Console
Основной инструмент для отладки:
- **F12** → Console
- Логи с префиксами: `[Background]`, `[Popup]`, `[DK]`

### 3. Chrome Extensions DevTools
- **chrome://extensions/** → Developer mode → Background page
- Доступ к Service Worker и его логам

---

## 🧪 Тестирование функций

### A. Основные функции торговой системы

#### 1. Тестирование торговых операций
```javascript
// В debug console:
chrome.runtime.sendMessage({
  action: "executeTrade",
  tradeAction: "buy", // или "sell"
  newsItem: {
    event: "Тестовая новость",
    currency: "EUR",
    actual: "1.5%",
    actualType: "GFP"
  }
});
```

#### 2. Активация/деактивация торговой системы
```javascript
// Активация
chrome.runtime.sendMessage({
  action: "activateTrading",
  selectedNews: { event: "Test News", currency: "EUR" },
  selectedAsset: "EUR",
  selectedPair: "EUR/USD"
});

// Деактивация
chrome.runtime.sendMessage({ action: "deactivateTrading" });
```

#### 3. Получение состояния системы
```javascript
chrome.runtime.sendMessage({ action: "getTradingState" }, (response) => {
  console.log("Состояние торговой системы:", response);
});
```

### B. Функции работы с новостями

#### 1. Обновление данных новостей
```javascript
chrome.runtime.sendMessage({ action: "openInvesting" });
```

#### 2. Просмотр сохраненных новостей
```javascript
chrome.storage.local.get(['newsData'], (result) => {
  console.log("Новости:", result.newsData);
});
```

#### 3. Очистка обработанных новостей
```javascript
chrome.storage.local.remove(['processedNews']);
```

### C. Функции авторизации и BID

#### 1. Проверка BID
```javascript
chrome.storage.local.get(['USER_BID'], (result) => {
  console.log("Текущий BID:", result.USER_BID);
});
```

#### 2. Принудительное получение BID
```javascript
// Выполнить на странице брокера в console:
getBID(); // или forceGetBID()
```

#### 3. Проверка подписки
```javascript
chrome.storage.local.get(['authToken'], async (result) => {
  if (result.authToken) {
    const isValid = await verifySubscription(result.authToken);
    console.log("Подписка валидна:", isValid);
  }
});
```

---

## 🔍 Отладка по компонентам

### Background Script (background.js)

#### Основные функции для тестирования:
```javascript
// 1. Проверить состояние торговой системы
console.log("Trading System State:", tradingSystem);

// 2. Ручная обработка новости
processNewsData([{
  event: "Test Event",
  currency: "EUR", 
  actual: "1.5%",
  actualType: "GFP"
}]);

// 3. Проверить торговые правила
console.log("Trading Rules:", TRADING_RULES);

// 4. Принудительное выполнение торговли
executeTrade("buy", { event: "Test", currency: "EUR", actual: "1.5%", actualType: "GFP" });
```

### Popup Script (popup.js)

#### Тестирование UI функций:
```javascript
// 1. Тест клика по элементу
clickElement(".action-high-low.button-call-wrap a.btn.btn-call");

// 2. Получение BID из активных вкладок
attemptGetBID().then(bid => console.log("BID:", bid));

// 3. Проверка мета-данных брокера
checkBrokerMeta();

// 4. Синхронизация с background
syncTradingSystemState();
```

### Content Script (content.js)

#### Функции для тестирования (выполнять на нужных страницах):
```javascript
// 1. На странице Investing.com
extractNewsData();

// 2. На странице брокера
getBID();
forceGetBID();

// 3. Проверка типа сайта
isBrokerSite();

// 4. Вставка водяного знака
insertWatermark();
```

---

## 📊 Мониторинг и логирование

### 1. Chrome Storage
```javascript
// Просмотр всех данных
chrome.storage.local.get(null, (result) => {
  console.log("Все данные storage:", result);
});

// Очистка всех данных
chrome.storage.local.clear();
```

### 2. История торговли
```javascript
chrome.storage.local.get(['tradeHistory'], (result) => {
  console.log("История торговли:", result.tradeHistory);
});
```

### 3. Системные уведомления
```javascript
// Тест уведомления
chrome.notifications.create({
  type: 'basic',
  iconUrl: 'icons/icon48.png',
  title: 'Test Notification',
  message: 'Тестовое уведомление'
});
```

---

## 🐛 Частые проблемы и решения

### 1. Торговая система не активируется
```javascript
// Проверить:
chrome.runtime.sendMessage({ action: "getTradingState" }, console.log);
chrome.storage.local.get(['tradingSystemActive'], console.log);

// Решение:
chrome.storage.local.set({ tradingSystemActive: false });
```

### 2. BID не получается
```javascript
// На странице брокера:
document.querySelector('.info__id'); // должен найти элемент
forceGetBID(10, 1000); // увеличить попытки и интервал
```

### 3. Новости не обновляются
```javascript
// Проверить вкладки Investing.com:
chrome.tabs.query({ url: "https://ru.investing.com/*" }, console.log);

// Принудительное обновление:
updateNewsData();
```

### 4. Клики не работают
```javascript
// Проверить селекторы на странице брокера:
document.querySelector('.action-high-low.button-call-wrap a.btn.btn-call');
document.querySelector('.action-high-low.button-put-wrap a.btn.btn-put');
```

---

## 🔧 Режим разработчика

### 1. Включение debug режима
```javascript
// В background.js добавить:
const DEBUG_MODE = true;

// Расширенное логирование
if (DEBUG_MODE) {
  console.log("[DEBUG]", ...args);
}
```

### 2. Тестовые данные
```javascript
// Тестовые новости
const TEST_NEWS = [{
  time: "12:00",
  event: "Test GDP",
  currency: "EUR",
  impact: 3,
  actual: "1.5%",
  actualType: "GFP",
  forecast: "1.2%",
  previous: "1.1%"
}];

// Загрузка тестовых данных
chrome.storage.local.set({ newsData: TEST_NEWS });
```

### 3. Мокирование API
```javascript
// Перехват fetch для тестирования
const originalFetch = window.fetch;
window.fetch = function(...args) {
  if (args[0].includes('verify')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        subscriptionActive: true,
        message: "Test subscription active"
      })
    });
  }
  return originalFetch.apply(this, args);
};
```

---

## 📝 Полезные команды

### Chrome DevTools Console
```javascript
// Получить ID расширения
chrome.runtime.id

// Перезагрузить расширение
chrome.runtime.reload()

// Открыть popup программно (в background context)
chrome.action.openPopup()

// Получить все вкладки
chrome.tabs.query({}, console.log)

// Выполнить скрипт на активной вкладке
chrome.tabs.query({active: true}, (tabs) => {
  chrome.scripting.executeScript({
    target: {tabId: tabs[0].id},
    func: () => console.log('Hello from content script!')
  });
});
```

### Storage операции
```javascript
// Экспорт настроек
chrome.storage.local.get(null, (data) => {
  console.log('Export:', JSON.stringify(data, null, 2));
});

// Импорт настроек
const importData = {}; // вставить данные
chrome.storage.local.set(importData);

// Бэкап critical данных
chrome.storage.local.get(['authToken', 'USER_BID', 'selectedNews'], (data) => {
  localStorage.setItem('dk_backup', JSON.stringify(data));
});
```

---

## 🎯 Быстрые тесты

### 1. Полный цикл торговли (в debug.html)
1. Авторизация → проверить BID
2. Выбор новости → проверить фокус  
3. Выбор пары → проверить селекторы
4. Активация → проверить background
5. Торговля → проверить execution

### 2. Стресс-тест
- Множественные активации/деактивации
- Быстрое переключение новостей
- Закрытие/открытие popup во время работы

### 3. Краевые случаи
- Отсутствие BID
- Отсутствие вкладок брокера
- Недоступность Investing.com
- Истекший токен авторизации

---

## 📞 Debug Console команды

Используйте эти команды в debug.html или browser console:

```javascript
// Быстрая диагностика
DK.diagnose();

// Полный сброс
DK.reset();

// Статус всех компонентов  
DK.status();

// Тест торговли
DK.test.trade('buy');

// Симуляция новости
DK.test.news({currency: 'EUR', actualType: 'GFP'});
```

---

💡 **Совет:** Всегда тестируйте на demo-счете брокера!
