// Пример серверного кода для поддержки проверки подписки
// Этот файл нужно добавить на ваш сервер http://176.108.253.203:8000

const express = require('express');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const JWT_SECRET = 'your-secret-key'; // Замените на ваш секретный ключ

// База данных пользователей (в реальном проекте используйте настоящую БД)
const users = {
  'user1': {
    password: 'password1',
    subscriptionEnd: new Date('2025-12-31'), // Дата окончания подписки
    isActive: true
  },
  'user2': {
    password: 'password2',
    subscriptionEnd: new Date('2024-01-01'), // Истекшая подписка
    isActive: true
  }
};

// Функция проверки активности подписки
function isSubscriptionActive(user) {
  if (!user.isActive) return false;
  return new Date() < user.subscriptionEnd;
}

// Эндпоинт для авторизации (существующий)
app.post('/login', (req, res) => {
  const { login, password } = req.body;
  
  const user = users[login];
  if (!user || user.password !== password) {
    return res.json({ success: false, message: 'Неверный логин или пароль' });
  }
  
  // Проверяем активность подписки при входе
  if (!isSubscriptionActive(user)) {
    return res.json({ 
      success: false, 
      message: 'Подписка истекла. Обратитесь к администратору.' 
    });
  }
  
  // Создаем токен с информацией о пользователе
  const token = jwt.sign(
    { 
      login, 
      subscriptionEnd: user.subscriptionEnd,
      iat: Math.floor(Date.now() / 1000)
    }, 
    JWT_SECRET, 
    { expiresIn: '30d' }
  );
  
  res.json({ success: true, token });
});

// Новый эндпоинт для проверки подписки
app.post('/verify', (req, res) => {
  const { token } = req.body;
  const authHeader = req.headers.authorization;
  
  // Получаем токен из заголовка или тела запроса
  const tokenToVerify = authHeader?.replace('Bearer ', '') || token;
  
  if (!tokenToVerify) {
    return res.json({ 
      success: false, 
      subscriptionActive: false, 
      message: 'Токен не предоставлен' 
    });
  }
  
  try {
    // Проверяем валидность токена
    const decoded = jwt.verify(tokenToVerify, JWT_SECRET);
    const user = users[decoded.login];
    
    if (!user) {
      return res.json({ 
        success: false, 
        subscriptionActive: false, 
        message: 'Пользователь не найден' 
      });
    }
    
    // Проверяем активность подписки
    const subscriptionActive = isSubscriptionActive(user);
    
    if (!subscriptionActive) {
      return res.json({ 
        success: false, 
        subscriptionActive: false, 
        message: 'Подписка истекла' 
      });
    }
    
    res.json({ 
      success: true, 
      subscriptionActive: true,
      subscriptionEnd: user.subscriptionEnd,
      message: 'Подписка активна'
    });
    
  } catch (error) {
    console.error('Ошибка проверки токена:', error);
    res.json({ 
      success: false, 
      subscriptionActive: false, 
      message: 'Недействительный токен' 
    });
  }
});

// Дополнительный эндпоинт для продления подписки (опционально)
app.post('/extend-subscription', (req, res) => {
  const { login, days } = req.body;
  
  const user = users[login];
  if (!user) {
    return res.json({ success: false, message: 'Пользователь не найден' });
  }
  
  // Продлеваем подписку на указанное количество дней
  const currentEnd = new Date(user.subscriptionEnd);
  const newEnd = new Date(currentEnd.getTime() + (days * 24 * 60 * 60 * 1000));
  user.subscriptionEnd = newEnd;
  
  res.json({ 
    success: true, 
    message: `Подписка продлена до ${newEnd.toLocaleDateString()}`,
    subscriptionEnd: newEnd
  });
});

// Эндпоинт для получения информации о подписке
app.get('/subscription-info/:login', (req, res) => {
  const { login } = req.params;
  const user = users[login];
  
  if (!user) {
    return res.json({ success: false, message: 'Пользователь не найден' });
  }
  
  res.json({
    success: true,
    login,
    subscriptionEnd: user.subscriptionEnd,
    isActive: user.isActive,
    subscriptionActive: isSubscriptionActive(user),
    daysLeft: Math.max(0, Math.ceil((user.subscriptionEnd - new Date()) / (1000 * 60 * 60 * 24)))
  });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log('Доступные эндпоинты:');
  console.log('POST /login - авторизация');
  console.log('POST /verify - проверка подписки');
  console.log('POST /extend-subscription - продление подписки');
  console.log('GET /subscription-info/:login - информация о подписке');
});

module.exports = app;
