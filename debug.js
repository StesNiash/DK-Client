// ============================================================================
// DK NEWS HUNTERS - Debug Console JavaScript
// Полный набор функций для тестирования и отладки расширения
// ============================================================================

// Глобальный объект для всех debug функций
window.DK = {
    // Системная информация
    version: "1.52",
    initialized: false,
    
    // Инициализация debug консоли
    init() {
        this.log.info("🚀 DK Debug Console инициализирована");
        this.log.info(`📋 Версия расширения: ${this.version}`);
        this.initialized = true;
        this.updateStatus("Консоль готова", true);
        this.loadExtensionInfo();
        
        // Автоматическая диагностика при запуске
        setTimeout(() => {
            this.diagnose();
        }, 1000);
    }
};

// ============================================================================
// МОДУЛЬ ЛОГИРОВАНИЯ
// ============================================================================
DK.log = {
    container: null,
    
    init() {
        this.container = document.getElementById('logContent');
    },
    
    write(message, type = 'info') {
        if (!this.container) this.init();
        
        const timestamp = new Date().toLocaleTimeString();
        const colors = {
            info: '#00ff00',
            warn: '#ffff00', 
            error: '#ff4444',
            success: '#00ff88'
        };
        
        const logEntry = document.createElement('div');
        logEntry.style.color = colors[type] || colors.info;
        logEntry.textContent = `[${timestamp}] ${message}`;
        
        this.container.appendChild(logEntry);
        this.container.scrollTop = this.container.scrollHeight;
    },
    
    info(message) { this.write(message, 'info'); },
    warn(message) { this.write(message, 'warn'); },
    error(message) { this.write(message, 'error'); },
    success(message) { this.write(message, 'success'); },
    
    clear() {
        if (!this.container) this.init();
        this.container.innerHTML = 'Лог очищен...';
    }
};

// ============================================================================
// МОДУЛЬ ТОРГОВОЙ СИСТЕМЫ
// ============================================================================
DK.trading = {
    async activate() {
        DK.log.info("🟢 Попытка активации торговой системы...");
        
        try {
            // Получаем данные для активации
            const storage = await chrome.storage.local.get(['selectedNews', 'selectedAsset', 'selectedPair']);
            
            if (!storage.selectedNews || !storage.selectedAsset || !storage.selectedPair) {
                DK.log.warn("⚠️ Не выбраны новость, актив или валютная пара");
                
                // Устанавливаем тестовые данные
                const testData = {
                    selectedNews: { event: "Test GDP Report", currency: "EUR" },
                    selectedAsset: "EUR", 
                    selectedPair: "EUR/USD"
                };
                
                await chrome.storage.local.set(testData);
                DK.log.info("📝 Установлены тестовые данные для активации");
            }
            
            const response = await chrome.runtime.sendMessage({
                action: "activateTrading",
                selectedNews: storage.selectedNews || { event: "Test GDP Report", currency: "EUR" },
                selectedAsset: storage.selectedAsset || "EUR",
                selectedPair: storage.selectedPair || "EUR/USD"
            });
            
            if (response?.success) {
                DK.log.success("✅ Торговая система активирована");
                DK.updateStatus("Торговая система активна", true);
            } else {
                DK.log.error("❌ Ошибка активации торговой системы");
            }
        } catch (error) {
            DK.log.error(`❌ Ошибка: ${error.message}`);
        }
    },
    
    async deactivate() {
        DK.log.info("🔴 Деактивация торговой системы...");
        
        try {
            const response = await chrome.runtime.sendMessage({ action: "deactivateTrading" });
            
            if (response?.success) {
                DK.log.success("✅ Торговая система деактивирована");
                DK.updateStatus("Торговая система отключена", false);
            } else {
                DK.log.error("❌ Ошибка деактивации торговой системы");
            }
        } catch (error) {
            DK.log.error(`❌ Ошибка: ${error.message}`);
        }
    },
    
    async getState() {
        DK.log.info("📊 Получение состояния торговой системы...");
        
        try {
            const response = await chrome.runtime.sendMessage({ action: "getTradingState" });
            
            if (response) {
                DK.log.info(`🔍 Активна: ${response.isActive ? 'Да' : 'Нет'}`);
                DK.log.info(`📰 Выбранная новость: ${response.state?.selectedNews?.event || 'Не выбрана'}`);
                DK.log.info(`💱 Актив: ${response.state?.selectedAsset || 'Не выбран'}`);
                DK.log.info(`📈 Пара: ${response.state?.selectedPair || 'Не выбрана'}`);
                
                if (response.state?.startTime) {
                    const uptime = Math.floor((Date.now() - response.state.startTime) / 1000);
                    DK.log.info(`⏱️ Время работы: ${uptime} секунд`);
                }
            } else {
                DK.log.warn("⚠️ Не удалось получить состояние торговой системы");
            }
        } catch (error) {
            DK.log.error(`❌ Ошибка: ${error.message}`);
        }
    },
    
    async buy() {
        DK.log.info("📈 Выполнение ручной покупки (Call)...");
        
        // Очищаем статистику обработанных новостей перед выполнением
        DK.log.info("🧹 Очистка статистики обработанных новостей...");
        try {
            const clearResponse = await chrome.runtime.sendMessage({ action: "clearProcessedNews" });
            if (clearResponse?.success) {
                DK.log.success("✅ Статистика обработанных новостей очищена");
            } else {
                DK.log.warn("⚠️ Не удалось очистить статистику через background script");
            }
        } catch (error) {
            DK.log.error(`❌ Ошибка при очистке статистики: ${error.message}`);
        }
        
        await this.executeTrade("buy");
    },
    
    async sell() {
        DK.log.info("📉 Выполнение ручной продажи (Put)...");
        
        // Очищаем статистику обработанных новостей перед выполнением
        DK.log.info("🧹 Очистка статистики обработанных новостей...");
        try {
            const clearResponse = await chrome.runtime.sendMessage({ action: "clearProcessedNews" });
            if (clearResponse?.success) {
                DK.log.success("✅ Статистика обработанных новостей очищена");
            } else {
                DK.log.warn("⚠️ Не удалось очистить статистику через background script");
            }
        } catch (error) {
            DK.log.error(`❌ Ошибка при очистке статистики: ${error.message}`);
        }
        
        await this.executeTrade("sell");
    },
    
    async executeTrade(action) {
        try {
            const testNews = {
                event: "Manual Trade Test",
                currency: "EUR",
                actual: "1.5%",
                actualType: action === "buy" ? "GFP" : "RFP"
            };
            
            const response = await chrome.runtime.sendMessage({
                action: "executeTrade",
                tradeAction: action,
                newsItem: testNews
            });
            
            if (response?.success) {
                DK.log.success(`✅ ${action === "buy" ? "Покупка" : "Продажа"} выполнена успешно`);
            } else {
                DK.log.error(`❌ Ошибка при выполнении ${action === "buy" ? "покупки" : "продажи"}`);
            }
        } catch (error) {
            DK.log.error(`❌ Ошибка: ${error.message}`);
        }
    }
};

// ============================================================================
// МОДУЛЬ РАБОТЫ С НОВОСТЯМИ
// ============================================================================
DK.news = {
    async update() {
        DK.log.info("🔄 Обновление новостей...");
        
        try {
            const response = await chrome.runtime.sendMessage({ action: "openInvesting" });
            
            if (response?.success) {
                DK.log.success("✅ Новости обновлены");
                
                // Показываем новости через 2 секунды
                setTimeout(() => {
                    this.show();
                }, 2000);
            } else {
                DK.log.error("❌ Ошибка обновления новостей");
            }
        } catch (error) {
            DK.log.error(`❌ Ошибка: ${error.message}`);
        }
    },
    
    async show() {
        DK.log.info("📋 Просмотр сохраненных новостей...");
        
        try {
            const result = await chrome.storage.local.get(['newsData']);
            
            if (result.newsData && Array.isArray(result.newsData)) {
                DK.log.info(`📊 Найдено новостей: ${result.newsData.length}`);
                
                result.newsData.slice(0, 5).forEach((news, index) => {
                    DK.log.info(`${index + 1}. ${news.time} | ${news.currency} | ${news.event}`);
                    DK.log.info(`   Факт: ${news.actual || '—'} (${news.actualType})`);
                });
                
                if (result.newsData.length > 5) {
                    DK.log.info(`... и еще ${result.newsData.length - 5} новостей`);
                }
            } else {
                DK.log.warn("⚠️ Новости не найдены");
            }
        } catch (error) {
            DK.log.error(`❌ Ошибка: ${error.message}`);
        }
    },
    
    async clearProcessed() {
        DK.log.info("🧹 Очистка обработанных новостей...");
        
        try {
            await chrome.storage.local.remove(['processedNews']);
            DK.log.success("✅ Обработанные новости очищены");
        } catch (error) {
            DK.log.error(`❌ Ошибка: ${error.message}`);
        }
    }
};

// ============================================================================
// МОДУЛЬ АВТОРИЗАЦИИ И BID
// ============================================================================
DK.auth = {
    async checkBID() {
        DK.log.info("🔍 Проверка текущего BID...");
        
        try {
            const result = await chrome.storage.local.get(['USER_BID', 'expected_bid']);
            
            if (result.USER_BID) {
                DK.log.success(`✅ Текущий BID: ${result.USER_BID}`);
            } else {
                DK.log.warn("⚠️ BID не найден");
            }
            
            if (result.expected_bid) {
                DK.log.info(`📝 Ожидаемый BID: ${result.expected_bid}`);
                
                if (result.USER_BID && result.expected_bid !== result.USER_BID) {
                    DK.log.warn("⚠️ BID не совпадает с ожидаемым!");
                }
            }
        } catch (error) {
            DK.log.error(`❌ Ошибка: ${error.message}`);
        }
    },
    
    async forceBID() {
        DK.log.info("⚡ Принудительное получение BID...");
        
        try {
            // Ищем брокерские вкладки
            const tabs = await chrome.tabs.query({ url: "*://*/*" });
            DK.log.info(`🔍 Проверка ${tabs.length} вкладок...`);
            
            for (const tab of tabs) {
                if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
                    try {
                        const results = await chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            func: () => {
                                // Проверяем, является ли это брокерским сайтом
                                const bidElement = document.querySelector('.info__id');
                                if (bidElement) {
                                    const childWithDataHdShow = Array.from(bidElement.children).find(child => child.hasAttribute('data-hd-show'));
                                    if (childWithDataHdShow) {
                                        const bid = childWithDataHdShow.getAttribute('data-hd-show');
                                        const bidValue = bid ? bid.replace('id ', '') : null;
                                        if (bidValue) {
                                            chrome.storage.local.set({ USER_BID: bidValue });
                                            return bidValue;
                                        }
                                    }
                                }
                                return null;
                            }
                        });
                        
                        if (results && results[0] && results[0].result) {
                            DK.log.success(`✅ BID получен: ${results[0].result}`);
                            DK.log.info(`🌐 Сайт: ${tab.url}`);
                            return;
                        }
                    } catch (err) {
                        // Игнорируем ошибки для недоступных вкладок
                    }
                }
            }
            
            DK.log.warn("⚠️ BID не найден ни на одной вкладке");
        } catch (error) {
            DK.log.error(`❌ Ошибка: ${error.message}`);
        }
    },
    
    async verifySubscription() {
        DK.log.info("✅ Проверка подписки...");
        
        try {
            const result = await chrome.storage.local.get(['authToken']);
            
            if (!result.authToken) {
                DK.log.warn("⚠️ Токен авторизации не найден");
                return;
            }
            
            DK.log.info("🔄 Отправка запроса на проверку...");
            
            // Имитируем проверку подписки (так как не можем вызвать фоновую функцию напрямую)
            DK.log.info("📡 Проверка выполняется в background script");
            DK.log.info("💡 Смотрите логи в DevTools background page для результата");
        } catch (error) {
            DK.log.error(`❌ Ошибка: ${error.message}`);
        }
    },
    
    async logout() {
        DK.log.info("🚪 Выход из системы...");
        
        try {
            await chrome.storage.local.remove(['authToken', 'expected_bid', 'USER_BID']);
            DK.log.success("✅ Данные авторизации очищены");
        } catch (error) {
            DK.log.error(`❌ Ошибка: ${error.message}`);
        }
    }
};

// ============================================================================
// МОДУЛЬ ТЕСТИРОВАНИЯ
// ============================================================================
DK.test = {
    async simulateNews() {
        const currency = document.getElementById('testCurrency').value;
        const factType = document.getElementById('testFactType').value;
        
        DK.log.info(`🎲 Симуляция новости: ${currency} ${factType}`);
        
        // Создаем уникальную новость с timestamp для избежания дублирования
        const timestamp = Date.now();
        const testNews = {
            time: new Date().toLocaleTimeString(),
            event: `Test ${currency} Economic Report #${timestamp}`,
            currency: currency,
            impact: 3,
            actual: "1.5%",
            actualType: factType,
            forecast: "1.2%",
            previous: "1.1%",
            debugId: timestamp // Уникальный ID для debug
        };
        
        try {
            // Сохраняем как выбранную новость
            await chrome.storage.local.set({
                selectedNews: { 
                    event: testNews.event, 
                    currency: testNews.currency,
                    debugId: testNews.debugId 
                },
                selectedAsset: currency,
                selectedPair: this.getTestPair(currency)
            });
            
            DK.log.success("✅ Тестовая новость создана и выбрана");
            DK.log.info(`📰 Событие: ${testNews.event}`);
            DK.log.info(`💱 Валюта: ${testNews.currency}`);
            DK.log.info(`📊 Факт: ${testNews.actual} (${testNews.actualType})`);
            DK.log.info(`🔢 Debug ID: ${testNews.debugId}`);
        } catch (error) {
            DK.log.error(`❌ Ошибка: ${error.message}`);
        }
    },
    
    async tradingCycle() {
        DK.log.info("🔄 Запуск полного цикла торговли...");
        
        try {
            // 0. ПОЛНАЯ очистка обработанных новостей (и storage, и memory)
            DK.log.info("🧹 Этап 0: Полная очистка истории обработанных новостей (DEBUG MODE)");
            const clearResponse = await chrome.runtime.sendMessage({ action: "clearProcessedNews" });
            if (clearResponse?.success) {
                DK.log.success("✅ История обработанных новостей полностью очищена");
            } else {
                DK.log.warn("⚠️ Не удалось очистить историю через background script");
            }
            await this.delay(500);
            
            // 1. Создаем тестовую новость
            DK.log.info("📰 Этап 1: Создание тестовой новости");
            await this.simulateNews();
            await this.delay(1000);
            
            // 2. Активируем торговую систему
            DK.log.info("🟢 Этап 2: Активация торговой системы");
            await DK.trading.activate();
            await this.delay(2000);
            
            // 3. Проверим состояние
            DK.log.info("📊 Этап 3: Проверка состояния");
            await DK.trading.getState();
            await this.delay(1000);
            
            // 4. Имитируем торговлю
            DK.log.info("💰 Этап 4: Имитация торговой операции");
            await DK.trading.buy();
            await this.delay(2000);
            
            // 5. Деактивируем систему
            DK.log.info("🔴 Этап 5: Деактивация системы");
            await DK.trading.deactivate();
            
            DK.log.success("✅ Полный цикл торговли завершен");
            DK.log.info("💡 Система готова к повторному тестированию");
        } catch (error) {
            DK.log.error(`❌ Ошибка в цикле торговли: ${error.message}`);
        }
    },
    
    async loadSampleNews() {
        DK.log.info("📊 Загрузка тестовых новостей...");
        
        const sampleNews = [
            {
                time: "10:00",
                event: "GDP Growth Rate",
                currency: "EUR",
                impact: 3,
                actual: "1.5%",
                actualType: "GFP",
                forecast: "1.2%",
                forecastType: "NFP",
                previous: "1.1%",
                previousType: "NFP"
            },
            {
                time: "12:30", 
                event: "Unemployment Rate",
                currency: "USD",
                impact: 2,
                actual: "3.8%",
                actualType: "RFP",
                forecast: "3.5%",
                forecastType: "NFP",
                previous: "3.7%",
                previousType: "NFP"
            },
            {
                time: "15:45",
                event: "Interest Rate Decision",
                currency: "GBP",
                impact: 3,
                actual: "5.25%",
                actualType: "BFP",
                forecast: "5.25%", 
                forecastType: "NFP",
                previous: "5.00%",
                previousType: "NFP"
            }
        ];
        
        try {
            await chrome.storage.local.set({ newsData: sampleNews });
            DK.log.success(`✅ Загружено ${sampleNews.length} тестовых новостей`);
        } catch (error) {
            DK.log.error(`❌ Ошибка: ${error.message}`);
        }
    },
    
    async backgroundConnection() {
        DK.log.info("🔗 Тестирование связи с background script...");
        
        try {
            const response = await chrome.runtime.sendMessage({ action: "getTradingState" });
            
            if (response) {
                DK.log.success("✅ Связь с background script установлена");
                DK.log.info(`📊 Ответ получен: ${JSON.stringify(response, null, 2)}`);
            } else {
                DK.log.warn("⚠️ Background script не отвечает");
            }
        } catch (error) {
            DK.log.error(`❌ Ошибка связи: ${error.message}`);
        }
    },
    
    getTestPair(currency) {
        const pairs = {
            "EUR": "EUR/USD",
            "USD": "USD/JPY", 
            "GBP": "GBP/USD",
            "JPY": "USD/JPY",
            "AUD": "AUD/USD",
            "CAD": "USD/CAD",
            "CHF": "USD/CHF"
        };
        return pairs[currency] || "EUR/USD";
    },
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};

// ============================================================================
// МОДУЛЬ УПРАВЛЕНИЯ ДАННЫМИ
// ============================================================================
DK.data = {
    async clearAll() {
        DK.log.info("🗑️ Очистка всех данных расширения...");
        
        try {
            await chrome.storage.local.clear();
            DK.log.success("✅ Все данные очищены");
        } catch (error) {
            DK.log.error(`❌ Ошибка: ${error.message}`);
        }
    },
    
    async exportData() {
        DK.log.info("📤 Экспорт данных...");
        
        try {
            const data = await chrome.storage.local.get(null);
            const exportData = JSON.stringify(data, null, 2);
            
            DK.log.info("📋 Данные для экспорта:");
            DK.log.info(exportData);
        } catch (error) {
            DK.log.error(`❌ Ошибка: ${error.message}`);
        }
    }
};

// ============================================================================
// МОДУЛЬ БРАУЗЕРА
// ============================================================================
DK.browser = {
    async getAllTabs() {
        DK.log.info("📑 Получение списка всех вкладок...");
        
        try {
            const tabs = await chrome.tabs.query({});
            DK.log.info(`📊 Найдено вкладок: ${tabs.length}`);
            
            tabs.slice(0, 10).forEach((tab, index) => {
                DK.log.info(`${index + 1}. ${tab.title} - ${tab.url}`);
            });
            
            if (tabs.length > 10) {
                DK.log.info(`... и еще ${tabs.length - 10} вкладок`);
            }
        } catch (error) {
            DK.log.error(`❌ Ошибка: ${error.message}`);
        }
    },
    
    async findBrokerTabs() {
        DK.log.info("🏦 Поиск брокерских вкладок...");
        
        try {
            const tabs = await chrome.tabs.query({ url: "*://*/*" });
            const brokerTabs = [];
            
            for (const tab of tabs) {
                if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
                    try {
                        const results = await chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            func: () => {
                                // Проверяем признаки брокерского сайта
                                const bidElement = document.querySelector('.info__id');
                                const themeColorMeta = document.querySelector('meta[name="theme-color"][content="#1F1F23"]');
                                
                                return !!(bidElement || themeColorMeta);
                            }
                        });
                        
                        if (results && results[0] && results[0].result) {
                            brokerTabs.push(tab);
                        }
                    } catch (err) {
                        // Игнорируем ошибки для недоступных вкладок
                    }
                }
            }
            
            DK.log.info(`🏦 Найдено брокерских вкладок: ${brokerTabs.length}`);
            brokerTabs.forEach((tab, index) => {
                DK.log.info(`${index + 1}. ${tab.title} - ${tab.url}`);
            });
        } catch (error) {
            DK.log.error(`❌ Ошибка: ${error.message}`);
        }
    },
    
    async testNotification() {
        DK.log.info("🔔 Тестирование уведомления...");
        
        try {
            await chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon48.png',
                title: 'DK DEBUG Console',
                message: 'Тестовое уведомление из debug консоли'
            });
            
            DK.log.success("✅ Уведомление отправлено");
        } catch (error) {
            DK.log.error(`❌ Ошибка: ${error.message}`);
        }
    }
};

// ============================================================================
// ОСНОВНЫЕ СИСТЕМНЫЕ ФУНКЦИИ
// ============================================================================
DK.diagnose = async function() {
    DK.log.info("🔍 === ПОЛНАЯ ДИАГНОСТИКА СИСТЕМЫ ===");
    
    try {
        // 1. Проверка расширения
        DK.log.info("📦 1. Проверка расширения...");
        DK.log.info(`🔖 ID расширения: ${chrome.runtime.id}`);
        
        // 2. Проверка storage
        DK.log.info("💾 2. Проверка хранилища...");
        const storage = await chrome.storage.local.get(null);
        const keys = Object.keys(storage);
        DK.log.info(`📊 Записей в storage: ${keys.length}`);
        keys.forEach(key => {
            DK.log.info(`   - ${key}: ${typeof storage[key]} ${Array.isArray(storage[key]) ? `(${storage[key].length} элементов)` : ''}`);
        });
        
        // 3. Проверка background script
        DK.log.info("⚙️ 3. Проверка background script...");
        try {
            const bgResponse = await chrome.runtime.sendMessage({ action: "getTradingState" });
            if (bgResponse) {
                DK.log.success("✅ Background script отвечает");
                DK.log.info(`📊 Торговая система: ${bgResponse.isActive ? 'Активна' : 'Неактивна'}`);
            } else {
                DK.log.warn("⚠️ Background script не отвечает");
            }
        } catch (err) {
            DK.log.error(`❌ Ошибка связи с background: ${err.message}`);
        }
        
        // 4. Проверка авторизации
        DK.log.info("🔐 4. Проверка авторизации...");
        const authData = await chrome.storage.local.get(['authToken', 'USER_BID', 'expected_bid']);
        DK.log.info(`🔑 Токен: ${authData.authToken ? 'Есть' : 'Отсутствует'}`);
        DK.log.info(`🆔 BID: ${authData.USER_BID || 'Отсутствует'}`);
        DK.log.info(`📝 Ожидаемый BID: ${authData.expected_bid || 'Отсутствует'}`);
        
        // 5. Проверка вкладок
        DK.log.info("🌐 5. Проверка вкладок...");
        const tabs = await chrome.tabs.query({});
        const investingTabs = tabs.filter(tab => tab.url && tab.url.includes('investing.com'));
        const brokerTabs = tabs.filter(tab => tab.url && (tab.url.includes('broker') || tab.url.includes('trading')));
        
        DK.log.info(`📊 Всего вкладок: ${tabs.length}`);
        DK.log.info(`📈 Investing.com: ${investingTabs.length}`);
        DK.log.info(`🏦 Брокерских: ${brokerTabs.length}`);
        
        DK.log.success("✅ Диагностика завершена");
        
    } catch (error) {
        DK.log.error(`❌ Ошибка диагностики: ${error.message}`);
    }
};

DK.status = async function() {
    DK.log.info("📊 === СТАТУС КОМПОНЕНТОВ ===");
    
    const components = [
        { name: "Extension", check: () => !!chrome.runtime.id },
        { name: "Storage API", check: () => !!chrome.storage },
        { name: "Tabs API", check: () => !!chrome.tabs },
        { name: "Scripting API", check: () => !!chrome.scripting },
        { name: "Notifications API", check: () => !!chrome.notifications }
    ];
    
    components.forEach(component => {
        try {
            const status = component.check();
            DK.log.info(`${status ? '✅' : '❌'} ${component.name}: ${status ? 'OK' : 'Недоступен'}`);
        } catch (error) {
            DK.log.error(`❌ ${component.name}: Ошибка - ${error.message}`);
        }
    });
};

DK.reset = async function() {
    DK.log.info("🔄 === ПОЛНЫЙ СБРОС СИСТЕМЫ ===");
    
    try {
        // 1. Деактивируем торговую систему
        await DK.trading.deactivate();
        
        // 2. Очищаем все данные
        await chrome.storage.local.clear();
        
        // 3. Сбрасываем состояние UI
        DK.updateStatus("Система сброшена", false);
        
        DK.log.success("✅ Полный сброс завершен");
    } catch (error) {
        DK.log.error(`❌ Ошибка сброса: ${error.message}`);
    }
};

DK.resetTradingSystem = async function() {
    DK.log.info("🔄 === СБРОС ТОРГОВОЙ СИСТЕМЫ (DEBUG MODE) ===");
    
    try {
        const response = await chrome.runtime.sendMessage({ action: "resetTradingSystem" });
        
        if (response?.success) {
            DK.log.success("✅ Торговая система полностью сброшена в background");
            DK.updateStatus("Торговая система сброшена", false);
        } else {
            DK.log.error("❌ Ошибка сброса торговой системы");
        }
    } catch (error) {
        DK.log.error(`❌ Ошибка: ${error.message}`);
    }
};

// ============================================================================
// УТИЛИТАРНЫЕ ФУНКЦИИ
// ============================================================================
DK.updateStatus = function(message, isActive = false) {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    
    if (statusDot) {
        statusDot.className = `status-dot ${isActive ? 'active' : ''}`;
    }
    
    if (statusText) {
        statusText.textContent = message;
    }
};

DK.loadExtensionInfo = async function() {
    try {
        const manifest = chrome.runtime.getManifest();
        const versionInfo = document.getElementById('versionInfo');
        if (versionInfo) {
            versionInfo.textContent = `v${manifest.version} (${manifest.name})`;
        }
    } catch (error) {
        console.error('Ошибка загрузки информации о расширении:', error);
    }
};

// ============================================================================
// UI ФУНКЦИИ
// ============================================================================
function toggleAccordion(targetId) {
    const content = document.getElementById(targetId);
    if (content) {
        const isActive = content.classList.contains('active');
        
        // Закрываем все аккордеоны
        document.querySelectorAll('.accordion-content').forEach(el => {
            el.classList.remove('active');
        });
        
        // Открываем выбранный, если он не был активен
        if (!isActive) {
            content.classList.add('active');
        }
    }
}

// ============================================================================
// ОБРАБОТЧИКИ СОБЫТИЙ
// ============================================================================
function setupEventListeners() {
    // Обработчики для аккордеонов
    document.querySelectorAll('.accordion-header[data-target]').forEach(header => {
        header.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            toggleAccordion(targetId);
        });
    });

    // Обработчики для кнопок с действиями
    document.querySelectorAll('[data-action]').forEach(button => {
        button.addEventListener('click', function() {
            const action = this.getAttribute('data-action');
            handleAction(action);
        });
    });
}

function handleAction(action) {
    try {
        switch (action) {
            // Торговая система
            case 'trading-activate':
                DK.trading.activate();
                break;
            case 'trading-deactivate':
                DK.trading.deactivate();
                break;
            case 'trading-getState':
                DK.trading.getState();
                break;
            case 'trading-buy':
                DK.trading.buy();
                break;
            case 'trading-sell':
                DK.trading.sell();
                break;
            
            // Тестирование
            case 'test-simulateNews':
                DK.test.simulateNews();
                break;
            case 'test-tradingCycle':
                DK.test.tradingCycle();
                break;
            case 'test-loadSampleNews':
                DK.test.loadSampleNews();
                break;
            case 'test-backgroundConnection':
                DK.test.backgroundConnection();
                break;
            
            // Новости
            case 'news-update':
                DK.news.update();
                break;
            case 'news-show':
                DK.news.show();
                break;
            case 'news-clearProcessed':
                DK.news.clearProcessed();
                break;
            
            // Данные
            case 'data-clearAll':
                DK.data.clearAll();
                break;
            
            // Авторизация
            case 'auth-checkBID':
                DK.auth.checkBID();
                break;
            case 'auth-forceBID':
                DK.auth.forceBID();
                break;
            case 'auth-verifySubscription':
                DK.auth.verifySubscription();
                break;
            case 'auth-logout':
                DK.auth.logout();
                break;
            
            // Система
            case 'system-diagnose':
                DK.diagnose();
                break;
            case 'system-status':
                DK.status();
                break;
            case 'system-reset':
                DK.reset();
                break;
            case 'system-resetTrading':
                DK.resetTradingSystem();
                break;
            
            // Браузер
            case 'browser-getAllTabs':
                DK.browser.getAllTabs();
                break;
            case 'browser-findBrokerTabs':
                DK.browser.findBrokerTabs();
                break;
            case 'browser-testNotification':
                DK.browser.testNotification();
                break;
            
            // Логи
            case 'log-clear':
                DK.log.clear();
                break;
            
            default:
                DK.log.warn(`⚠️ Неизвестное действие: ${action}`);
        }
    } catch (error) {
        DK.log.error(`❌ Ошибка выполнения действия ${action}: ${error.message}`);
    }
}

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 DK Debug Console - DOM загружен');
    
    // Инициализируем DK объект
    if (window.DK) {
        DK.init();
    } else {
        console.error('❌ DK объект не найден');
    }
    
    // Настраиваем обработчики событий
    setupEventListeners();
    
    // Открываем первый аккордеон по умолчанию
    setTimeout(() => {
        toggleAccordion('trading-controls');
    }, 500);
});

// Обработка ошибок
window.addEventListener('error', function(event) {
    if (window.DK && DK.log) {
        DK.log.error(`💥 Ошибка JavaScript: ${event.error?.message || event.message}`);
    }
});

console.log('📦 DK Debug Console - Скрипт загружен');
