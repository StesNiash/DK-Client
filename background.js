chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "openInvesting") {
    const investingUrl = "https://ru.investing.com/economic-calendar/";

    const handleResult = (tabId) => {
      chrome.scripting.executeScript({
        target: { tabId },
        func: extractNewsData
      }, (results) => {
        if (results && results[0] && results[0].result) {
          chrome.storage.local.set({ newsData: results[0].result });
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false });
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

    return true; // async sendResponse
  }
});

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
