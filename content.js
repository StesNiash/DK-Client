// content.js
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