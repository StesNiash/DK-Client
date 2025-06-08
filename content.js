// content.js
console.log('[DK] Content script загружен');
console.log('[DK] Document body:', document.body ? 'найден' : 'не найден');

// Функция для вставки водяного знака
function insertWatermark() {
  // Проверяем, не добавлен ли уже знак
  if (document.querySelector('#dk-watermark')) return;

  console.log('[DK] Поиск элемента .chart-item.is-quick...');
  const target = document.querySelector('.chart-item.is-quick');
  
  if (!target) {
    console.log('[DK] Элемент .chart-item.is-quick не найден');
    return;
  }
  
  console.log('[DK] Элемент .chart-item.is-quick найден');

  const watermark = document.createElement('img');
  watermark.id = 'dk-watermark';
  
  // Проверка доступности ресурса
  const watermarkUrl = chrome.runtime.getURL('icons/watermark_small.png');
  console.log('[DK] URL водяного знака:', watermarkUrl);
  
  // Проверка существования ресурса
  fetch(watermarkUrl)
    .then(response => {
      if (!response.ok) throw new Error('Ресурс недоступен');
      console.log('[DK] Ресурс водяного знака доступен');
      watermark.src = watermarkUrl;
    })
    .catch(error => {
      console.error('[DK] Ошибка загрузки ресурса:', error.message);
      // Используем fallback изображение
      watermark.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100%" height="100%" fill="red"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="10">WATERMARK</text></svg>';
    });
  watermark.style.cssText = `
    position: absolute;
    bottom: 10px;
    right: 10px;
    opacity: var(--dk-watermark-opacity, 0.2);
    pointer-events: none;
    z-index: 9999;
    max-width: 160px;
    max-height: 80px;
  `;
  
  target.prepend(watermark);
  target.style.position = 'relative';
  console.log('[DK] Водяной знак добавлен');
}

// Вставляем водяной знак при загрузке страницы
insertWatermark();

// Для динамических страниц
new MutationObserver(insertWatermark)
  .observe(document, { childList: true, subtree: true });

// Существующий функционал для investing.com
if (window.location.hostname === 'www.investing.com') {
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
