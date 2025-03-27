const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// Configuration and Constants
const BOT_TOKEN = '1160037511:UNYPZY1GhLScNYpI1bLIJ77wayIqELOjtT48mbaJ';
const CHANNEL_ID = 5272323810; // Literal Channel UID
const ADMINS = ['zonercm', 'id_hormoz']; // Whitelisted usernames

// Utility Functions
const { 
  getIranianDate, 
  getIranianTime, 
  generateRandomCode 
} = require('./utils');

// Data Management
const DATA_FILES = {
  USERS: path.join(__dirname, 'users.json'),
  FILES: path.join(__dirname, 'files.json'),
  TEXTS: path.join(__dirname, 'texts.json')
};

// Ensure data files exist
async function initializeDataFiles() {
  for (const filePath of Object.values(DATA_FILES)) {
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, JSON.stringify({}));
    }
  }
}

// Telegram API Helpers
async function sendMessage(chatId, text, options = {}) {
  try {
    await axios.post(`https://tapi.bale.ai/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text,
      ...options
    });
  } catch (error) {
    console.error('Error sending message:', error.response ? error.response.data : error.message);
  }
}

async function checkUserChannelMembership(userId) {
  try {
    const response = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getChatMember`, {
      params: {
        chat_id: CHANNEL_ID,
        user_id: userId
      }
    });
    
    const status = response.data.result.status;
    return ['member', 'administrator', 'creator'].includes(status);
  } catch (error) {
    console.error('Channel membership check error:', error.response ? error.response.data : error.message);
    return false;
  }
}

// Main Bot Logic
async function handleStart(userId, username, firstName) {
  const isMember = await checkUserChannelMembership(userId);
  
  if (!isMember) {
    await sendMessage(userId, `🚪 برای استفاده از ربات، ابتدا باید در کانال زیر عضو شوید:`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔗 پیوستن به کانال', url: `https://t.me/c/${CHANNEL_ID.replace('-100', '')}` }],
          [{ text: '✅ بررسی عضویت', callback_data: 'check_membership' }]
        ]
      }
    });
    return;
  }

  // Greet user with Iranian date and time
  const greeting = `سلام ${firstName || 'عزیز'}! 👋\n\n` +
    `تاریخ امروز: ${getIranianDate()}\n` +
    `ساعت دقیق: ${getIranianTime()}`;
  
  await sendMessage(userId, greeting);
}

// Admin Panel Handler
async function handleAdminPanel(userId, username) {
  if (!ADMINS.includes(username)) {
    await sendMessage(userId, '❌ شما مجاز به استفاده از پنل ادمین نیستید.');
    return;
  }

  await sendMessage(userId, 'پنل ادمین:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📁 آپلود فایل', callback_data: 'upload_file' }],
        [{ text: '📝 آپلود متن', callback_data: 'upload_text' }],
        [{ text: '🆔 لیست کاربران', callback_data: 'list_users' }],
        [{ text: '📨 ارسال پیام متنی', callback_data: 'send_text_to_users' }],
        [{ text: '🖼 ارسال تصویر', callback_data: 'send_image_to_users' }]
      ]
    }
  });
}

// Main Update Handler
async function handleUpdate(update) {
  // Initialize data files if not exist
  await initializeDataFiles();

  // Extract relevant information
  const message = update.message || {};
  const callbackQuery = update.callback_query;

  if (callbackQuery) {
    // Handle callback queries (inline keyboard interactions)
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    switch (data) {
      case 'check_membership':
        // Implement membership check logic
        break;
      // Add other callback handlers
    }
    return;
  }

  if (message.text) {
    const userId = message.from.id;
    const username = message.from.username;
    const firstName = message.from.first_name;
    const text = message.text;

    if (text === '/start') {
      await handleStart(userId, username, firstName);
    } else if (text === 'پنل') {
      await handleAdminPanel(userId, username);
    }
  }
}

// Polling Function
async function startBot() {
  let offset = 0;
  console.log('🤖 Bot started successfully!');

  while (true) {
    try {
      const response = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`, {
        params: {
          offset,
          timeout: 30
        }
      });

      const updates = response.data.result;
      
      for (const update of updates) {
        offset = update.update_id + 1;
        await handleUpdate(update);
      }
    } catch (error) {
      console.error('Error in bot polling:', error);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// Start the bot
startBot().catch(console.error);

module.exports = { startBot, handleUpdate };
