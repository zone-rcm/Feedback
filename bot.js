const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const moment = require('moment-jalaali');
const redis = require('redis');

moment.loadPersian({ usePersianDigits: true });

const botToken = '1160037511:EQNWiWm1RMmMbCydsXiwOsEdyPbmomAuwu4tX6Xb';
const bot = new TelegramBot(botToken, { polling: true });

const redisClient = redis.createClient();
redisClient.connect();

const WHITELISTED_USERS = [844843541, 1085839779]; // Replace with actual user IDs
const GROUP_ID = 5272323810; // Replace with your group ID

let autoMessageEnabled = false;
let autoMessageText = '🔔 پیام خودکار برای کاربران غیرگروهی!';

// Persian date function
function getPersianDate() {
  return moment().format('jYYYY/jMM/jDD HH:mm');
}

// Custom UID generator
function generateUID() {
  return Math.random().toString(36).substr(2, 10);
}

// Greet users
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'کاربر';
  const persianDate = getPersianDate();
  
  const response = `👋 سلام ${firstName}!\n📅 تاریخ: ${persianDate}`;
  bot.sendMessage(chatId, response);
});

// Panel access for whitelisted users
bot.onText(/پنل/, async (msg) => {
  const chatId = msg.chat.id;
  if (!WHITELISTED_USERS.includes(chatId.toString())) return;
  
  bot.sendMessage(chatId, '⚙️ منو مدیریت:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📩 پیام‌رسانی', callback_data: 'messaging' }],
        [{ text: '📂 ارسال فایل', callback_data: 'upload_file' }]
      ]
    }
  });
});

// Messaging menu
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data === 'messaging') {
    bot.editMessageText('📩 گزینه‌های پیام‌رسانی:', {
      chat_id: chatId,
      message_id: query.message.message_id,
      reply_markup: {
        inline_keyboard: [
          [{ text: '📢 ارسال به همه', callback_data: 'send_all' }],
          [{ text: '👥 ارسال به گروه', callback_data: 'send_group' }],
          [{ text: '🚫 ارسال به غیرگروه', callback_data: 'send_non_group' }],
          [{ text: autoMessageEnabled ? '❌ غیرفعال‌سازی پیام خودکار' : '✅ فعال‌سازی پیام خودکار', callback_data: 'toggle_auto' }]
        ]
      }
    });
  } else if (data === 'toggle_auto') {
    autoMessageEnabled = !autoMessageEnabled;
    bot.answerCallbackQuery(query.id, { text: autoMessageEnabled ? '✅ فعال شد' : '❌ غیرفعال شد' });
  }
});

// Sending messages
bot.onText(/\/sendall (.+)/, async (msg, match) => {
  const text = match[1];
  const keys = await redisClient.keys('user:*');
  for (let key of keys) {
    const userId = key.split(':')[1];
    bot.sendMessage(userId, `📢 پیام جدید:\n\n${text}`);
  }
  bot.sendMessage(msg.chat.id, '✅ پیام به همه ارسال شد.');
});

bot.onText(/\/sendgroup (.+)/, async (msg, match) => {
  const text = match[1];
  bot.sendMessage(GROUP_ID, `👥 پیام برای گروه:\n\n${text}`);
  bot.sendMessage(msg.chat.id, '✅ پیام به گروه ارسال شد.');
});

bot.onText(/\/sendnongroup (.+)/, async (msg, match) => {
  const text = match[1];
  const keys = await redisClient.keys('user:*');
  for (let key of keys) {
    const userId = key.split(':')[1];
    if (userId !== GROUP_ID) {
      bot.sendMessage(userId, `🚫 پیام برای غیرگروهی‌ها:\n\n${text}`);
    }
  }
  bot.sendMessage(msg.chat.id, '✅ پیام به کاربران غیرگروهی ارسال شد.');
});

// Auto-message feature
setInterval(async () => {
  if (autoMessageEnabled) {
    const keys = await redisClient.keys('user:*');
    for (let key of keys) {
      const userId = key.split(':')[1];
      if (userId !== GROUP_ID) {
        bot.sendMessage(userId, autoMessageText);
      }
    }
  }
}, 7200000); // 2 hours in milliseconds

// File upload system
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data === 'upload_file') {
    bot.sendMessage(chatId, '❓ آیا فایل رمز عبور دارد؟', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔐 بله', callback_data: 'file_with_pass' }],
          [{ text: '📁 خیر', callback_data: 'file_no_pass' }]
        ]
      }
    });
  }
});

let fileUploadState = {};

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data === 'file_with_pass') {
    fileUploadState[chatId] = { requiresPassword: true };
    bot.sendMessage(chatId, '🔑 لطفاً رمز عبور را ارسال کنید.');
  } else if (data === 'file_no_pass') {
    fileUploadState[chatId] = { requiresPassword: false };
    bot.sendMessage(chatId, '📎 لطفاً فایل را ارسال کنید.');
  }
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  if (fileUploadState[chatId]) {
    if (fileUploadState[chatId].requiresPassword && msg.text) {
      fileUploadState[chatId].password = msg.text;
      bot.sendMessage(chatId, '✅ رمز عبور ذخیره شد. حالا فایل را ارسال کنید.');
    } else if (msg.document) {
      const fileId = msg.document.file_id;
      const fileUID = generateUID();
      await redisClient.set(fileUID, JSON.stringify({ fileId, password: fileUploadState[chatId].password || null }));

      delete fileUploadState[chatId];

      bot.sendMessage(chatId, `📂 فایل ذخیره شد!\n🔗 لینک دریافت فایل:\n\`\`\`/start ${fileUID}\`\`\``);
    }
  }
});

// Fetch file when start link is used
bot.onText(/\/start (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const fileUID = match[1];

  const fileData = await redisClient.get(fileUID);
  if (!fileData) return bot.sendMessage(chatId, '❌ فایل مورد نظر یافت نشد.');

  const { fileId, password } = JSON.parse(fileData);
  if (password) {
    bot.sendMessage(chatId, '🔐 لطفاً رمز عبور را ارسال کنید.');
    bot.once('message', async (msg) => {
      if (msg.text === password) {
        bot.sendDocument(chatId, fileId);
      } else {
        bot.sendMessage(chatId, '❌ رمز اشتباه است.');
      }
    });
  } else {
    bot.sendDocument(chatId, fileId);
  }
});
