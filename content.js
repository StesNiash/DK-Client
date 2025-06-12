// content.js
console.log('[DK] Content script загружен');
console.log('[DK] Document body:', document.body ? 'найден' : 'не найден');

// Конфигурация
const MAX_ATTEMPTS = 10; // Максимальное количество попыток вставки
let attemptCount = 0;    // Счетчик попыток
let watermarkAdded = false;
let beautifyInvestingProcessed = false;
let adRemoved = false;
let elementsRemoved = false;
let UserAppData = undefined;

// Оптимизированный observer
const observer = new MutationObserver(() => {
  if (!watermarkAdded && attemptCount < MAX_ATTEMPTS) {
    insertWatermark();
  } else if (attemptCount >= MAX_ATTEMPTS) {
    console.log('[DK] Достигнут лимит попыток. Остановка.');
    observer.disconnect();
  }
});

function beautifyInvesting() {
  // Проверяем, что функция не была запущена ранее
  if (beautifyInvestingProcessed) {
    return;
  }
  // Проверяем, что сайт - investing.com
  // Проверяем наличие в URL слова investing
  if (!window.location.hostname.includes('investing')) {
    console.log('[DK] Сайт не является investing.com, пропуск функции beautifyInvesting');
    return;
  }
  console.log('[DK] Запуск beautifyInvesting');
  // Запускаем функции для удаления рекламы и улучшения внешнего вида
  if (!adRemoved) {
    adRemoved = delete_advertising();
  }
  if (!elementsRemoved) {
    elementsRemoved = remove_unnecessary_elements();
  }
  if (adRemoved || elementsRemoved) {
    beautifyInvestingProcessed = true; // Помечаем, что функция была выполнена
    console.log('[DK] Реклама и ненужные элементы удалены');
  }
}

function delete_advertising() {
  // Находим элемент с классами: ad-blockers-section, select-ad-blocker, displayNone
  const adElement = document.querySelector('.ad-blockers-section.select-ad-blocker.displayNone');
  if (adElement && adElement.parentElement) {
    // Удаляем родительский элемент целиком
    adElement.parentElement.remove();
    console.log('[DK] Родительский рекламный блок удален');
    return true;
  }
  console.log('[DK] Рекламный блок не найден или отсутствует родитель');
  return true;
}

function remove_unnecessary_elements() {
  // Находим элементы с классами, которые нужно удалить
  const classesToRemove = [
    'secondaryOverlay.js-general-overlay', // Оверлей с блокировкой доступа
    'midHeader', // Верхняя секция с местом под рекламу
    //'rightColumn' // Правая секция
  ];

  // Удаляем все элементы из списка
  classesToRemove.forEach(className => {
    const elements = document.querySelectorAll(`.${className}`);
    elements.forEach(element => {
      element.remove();
      console.log(`[DK] Элемент с классом ${className} удален`);
    });
  });
  return true
}

beautifyInvesting();

// Добавляем MutationObserver для обработки динамического контента
const adObserver = new MutationObserver(() => {
  if (delete_advertising()) {
    adObserver.disconnect();
    console.log('[DK] Observer остановлен после удаления элемента');
  }
});

// Запускаем observer если элемент не был удален сразу
if (!delete_advertising()) {
  adObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
  console.log('[DK] Запущен observer для отслеживания динамического контента');
}
// Функция для удаления ненужных элементов

function insertWatermark() {
  // Если знак уже добавлен, выходим
  if (watermarkAdded) return;
  
  // Проверяем, не добавлен ли уже знак
  if (document.querySelector('#dk-watermark')) {
    watermarkAdded = true;
    observer.disconnect();
    return;
  }

  // Увеличиваем счетчик попыток
  attemptCount++;

  console.log(`[DK] Попытка #${attemptCount} найти элемент .chart-item.is-quick...`);
  const target = document.querySelector('.chart-item.is-quick');

  if (!target) {
    console.log('[DK] Элемент не найден');
    return;
  }

  console.log('[DK] Элемент найден');

  const watermark = document.createElement('img');
  watermark.id = 'dk-watermark';
  
  // Проверка доступности ресурса
  const watermarkUrl = chrome.runtime.getURL('icons/watermark_small.png');
  console.log('[DK] URL водяного знака:', watermarkUrl);
  
  // Проверка существования ресурса
  fetch(watermarkUrl)
    .then(response => {
      if (!response.ok) throw new Error('Ресурс недоступен');
      console.log('[DK] Ресурс доступен');
      watermark.src = watermarkUrl;
    })
    .catch(error => {
      console.error('[DK] Ошибка загрузки:', error.message);
      // Fallback изображение
      watermark.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="red"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="10">WATERMARK</text></svg>';
    });
    
  watermark.style.cssText = `
    position: absolute;
    bottom: 10px;
    right: 10px;
    opacity: var(--dk-watermark-opacity, 0.3);
    pointer-events: none;
    z-index: 9999;
    max-width: 160px;
    max-height: 80px;
  `;
  
  target.prepend(watermark);
  target.style.position = 'relative';
  console.log('[DK] Водяной знак добавлен');
  
  // Помечаем как добавленный и отключаем observer
  watermarkAdded = true;
  observer.disconnect();
}

// Функция проверки сайта брокера
function isBrokerSite() {
  // 1. Проверка специфичных мета-тегов
  const themeColorMeta = document.querySelector('meta[name="theme-color"][content="#1F1F23"]');
  const colorSchemesMeta = document.querySelector('meta[name="supported-color-schemes"][content="light dark"]');
  if (themeColorMeta && colorSchemesMeta) {
    console.log('[DK] Найдены специфичные мета-теги брокера');
    return true;
  }
  
  // 2. Проверка Open Graph
  const ogSite = document.querySelector('meta[property="og:site_name"][content*="Broker"], meta[property="og:site_name"][content*="Trading"]');
  if (ogSite) {
    console.log('[DK] Определено по Open Graph');
    return true;
  }
  
  // 3. Проверка домена
  if (window.location.hostname.includes('broker') || window.location.hostname.includes('trading')) {
    console.log('[DK] Определено по домену');
    return true;
  }
  
  console.log('[DK] Сайт не является брокером');
  return false;
}

// Функция для извлечения bid из элемента <div>
function getBID() {
    // Поиск элемента <div> с классом info__id, ребёнок которого содержит атрибут data-hd-show
    // Используем querySelector для упрощения поиска
    const divElement = document.querySelector('.info__id');
    
    if (divElement) {
        const childWithDataHdShow = Array.from(divElement.children).find(child => child.hasAttribute('data-hd-show'));
        // Если нашли нужный элемент, получаем значение атрибута data-hd-show
        if (childWithDataHdShow) {
            const bid = childWithDataHdShow.getAttribute('data-hd-show');
            // Если bid содержит строку 'id ', удаляем её
            const bidValue = bid ? bid.replace('id ', '') : null;

        console.log('BID:', bidValue);
        return bidValue;
    } else {
        console.error('Элемент <div> не найден.');
    }
}}

// Основная инициализация
  if (isBrokerSite()) {
  // Сохраняем BID при загрузке страницы
  const handleLoad = () => {
    const bid = getBID();
    if (bid) {
      chrome.storage.local.set({ USER_BID: bid });
    }
  };
  
  if (document.readyState === 'complete') {
    handleLoad();
  } else {
    window.addEventListener('load', handleLoad);
  }

  // Упрощенное ожидание целевого элемента
  const elementObserver = new MutationObserver(() => {
    const target = document.querySelector('.chart-item.is-quick');
    if (target && target.offsetParent !== null) {
      console.log('[DK] Целевой элемент обнаружен и видим');
      elementObserver.disconnect();
      insertWatermark();
    }
  });

  // Начинаем наблюдение после загрузки DOM
  if (document.body) {
    elementObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true
    });
    console.log('[DK] Наблюдение за целевым элементом начато');
  }

  // Fallback на случай проблем с загрузкой
  setTimeout(() => {
    if (!watermarkAdded) {
      console.log('[DK] Активация по fallback-таймауту');
      elementObserver.disconnect();
      insertWatermark();
    }
  }, 30000);

  // Первоначальная проверка
  const initialTarget = document.querySelector('.chart-item.is-quick');
  if (initialTarget && initialTarget.offsetParent !== null) {
    console.log('[DK] Элемент уже присутствует');
    insertWatermark();
  }
} else {
  console.log('[DK] Сайт не является брокером, функционал не запущен');
  // Очищаем BID для не-брокерских сайтов
  chrome.storage.local.remove("USER_BID");
}

// Существующий функционал для investing.com
if (window.location.hostname === 'www.investing.com') {
  console.log('[DK] Запуск функционала для investing.com');
  
  const newsRows = document.querySelectorAll("table.genTbl tr.js-event-item");
  const news = [];

  newsRows.forEach(row => {
    const timeElement = row.querySelector(".first.left.time.js-time");
    const currencyElement = row.querySelector(".left.flagCur.noWrap");
    const eventElement = row.querySelector("a[href^='/economic-calendar']");
    const sentimentElement = row.querySelector(".sentiment");

    if (timeElement && eventElement && sentimentElement) {
      const time = timeElement.textContent.trim();
      const currency = currencyElement ? currencyElement.textContent.trim() : "Неизвестно";
      const event = eventElement.textContent.trim();
      const impact = sentimentElement.querySelectorAll("i.grayFullBullishIcon").length;

      let actualText = '';
      let actualType = 'NFP';
      let factSelector = null;

      const actualCell = row.querySelector("td.act");
      if (actualCell) {
        actualText = actualCell.textContent.trim();
        const actualClass = actualCell.classList;

        if (actualClass.contains("redFont")) actualType = 'RFP';
        if (actualClass.contains("greenFont")) actualType = 'GFP';
        if (actualClass.contains("blackFont")) actualType = 'BFP';

        const id = actualCell.id;
        if (id) {
          factSelector = `#${id}`;
        }
      }

      news.push({
        time,
        currency,
        event,
        impact,
        actual: actualText,
        actualType,
        factSelector
      });
    }
  });

  chrome.runtime.sendMessage({ action: "storeNewsData", newsData: news });
}
