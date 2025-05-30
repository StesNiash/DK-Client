# Инструкция по настройке проверки подписки

## Что было изменено

Добавлена система автоматической проверки подписки, которая разлогинивает пользователей при истечении подписки.

### Изменения в клиентской части (popup.js):

1. **Добавлена константа VERIFY_URL** - URL для проверки подписки
2. **Функция logout()** - выход из системы с очисткой токена
3. **Функция verifySubscription()** - проверка статуса подписки на сервере
4. **Проверка при запуске** - автоматическая проверка подписки при открытии расширения
5. **Периодическая проверка** - проверка каждые 5 минут в фоновом режиме

### Новые серверные эндпоинты (server_example.js):

1. **POST /verify** - проверка активности подписки
2. **POST /extend-subscription** - продление подписки (опционально)
3. **GET /subscription-info/:login** - получение информации о подписке

## Установка на сервере

### 1. Установите зависимости:
```bash
npm install express jsonwebtoken cors
```

### 2. Обновите существующий сервер или создайте новый:

Скопируйте код из `server_example.js` и адаптируйте под вашу существующую серверную архитектуру.

### 3. Настройте базу данных:

В примере используется объект в памяти. В реальном проекте замените на вашу БД:

```javascript
// Пример структуры пользователя в БД
{
  login: "user1",
  password: "hashed_password",
  subscriptionEnd: "2025-12-31T23:59:59.000Z",
  isActive: true
}
```

### 4. Настройте JWT_SECRET:

Замените `'your-secret-key'` на ваш реальный секретный ключ.

## Как это работает

### При запуске расширения:
1. Расширение проверяет наличие токена в локальном хранилище
2. Если токен есть, отправляется запрос на `/verify` для проверки подписки
3. Если подписка активна - показывается основной интерфейс
4. Если подписка истекла - пользователь разлогинивается

### Периодическая проверка:
- Каждые 5 минут расширение автоматически проверяет статус подписки
- При истечении подписки пользователь немедленно разлогинивается

### При авторизации:
- Сервер проверяет подписку перед выдачей токена
- Пользователи с истекшей подпиской не могут войти в систему

## Настройка интервала проверки

Чтобы изменить частоту проверки подписки, измените значение в popup.js:

```javascript
// Текущее значение: 5 минут
}, 5 * 60 * 1000);

// Для проверки каждую минуту:
}, 1 * 60 * 1000);

// Для проверки каждые 10 минут:
}, 10 * 60 * 1000);
```

## Управление подписками

### Продление подписки:
```bash
curl -X POST http://176.108.253.203:8000/extend-subscription \
  -H "Content-Type: application/json" \
  -d '{"login": "user1", "days": 30}'
```

### Проверка информации о подписке:
```bash
curl http://176.108.253.203:8000/subscription-info/user1
```

### Деактивация пользователя:
```javascript
// В коде сервера
users['user1'].isActive = false;
```

## Безопасность

1. **JWT токены** содержат информацию о дате окончания подписки
2. **Проверка на сервере** - клиент не может обойти проверку подписки
3. **Автоматический logout** при истечении подписки
4. **Graceful handling** сетевых ошибок - пользователь не разлогинивается при временных проблемах с сетью

## Тестирование

### Тест с активной подпиской:
1. Создайте пользователя с датой окончания в будущем
2. Войдите в расширение
3. Проверьте, что функционал доступен

### Тест с истекшей подпиской:
1. Создайте пользователя с датой окончания в прошлом
2. Попробуйте войти - должна появиться ошибка
3. Если пользователь уже авторизован, он должен быть разлогинен при следующей проверке

### Тест периодической проверки:
1. Войдите с активной подпиской
2. Измените дату окончания на прошлую в БД
3. Подождите до 5 минут - пользователь должен быть разлогинен

## Возможные улучшения

1. **Уведомления** о скором истечении подписки
2. **Graceful degradation** - ограничение функций вместо полного отключения
3. **Кэширование** результатов проверки для снижения нагрузки на сервер
4. **Логирование** попыток использования с истекшей подпиской
5. **Интеграция с платежными системами** для автоматического продления

## Поддержка

При возникновении проблем проверьте:
1. Доступность сервера по адресу http://176.108.253.203:8000/verify
2. Корректность JWT_SECRET на сервере
3. Формат дат в базе данных
4. Логи сервера для диагностики ошибок
