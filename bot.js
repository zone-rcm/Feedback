const axios = require('axios');
const moment = require('moment-jalaali');

// Replace with your bot's token
const token = '1355028807:FpSzen2exQIhLI47fQtyQVDZjO5Xr99P4ELXCc42';
const apiUrl = `https://tapi.bale.ai/bot${token}/`;

// Special users to receive the feedback
const specialUsers = [844843541];

// Store feedbacks to prevent multiple feedbacks per user per day
const feedbacks = {};

// Helper to get Persian numerals
function toPersianNumerals(number) {
  const persianNumerals = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return number.toString().split('').map(digit => persianNumerals[parseInt(digit)]).join('');
}

// Format the date in Persian using Jalaali
function formatDate() {
  return moment().format('jYYYY/jMM/jDD ساعت HH:mm');
}

// Send a message using axios
function sendMessage(chatId, text, replyMarkup = {}) {
  return axios.post(`${apiUrl}sendMessage`, {
    chat_id: chatId,
    text: text,
    reply_markup: replyMarkup
  }).catch(error => {
    console.error('Error sending message:', error.response ? error.response.data : error.message);
  });
}

// Edit a message using axios
function editMessage(chatId, messageId, text, replyMarkup = {}) {
  return axios.post(`${apiUrl}editMessageText`, {
    chat_id: chatId,
    message_id: messageId,
    text: text,
    reply_markup: replyMarkup
  }).catch(error => {
    console.error('Error editing message:', error.response ? error.response.data : error.message);
  });
}

// Store pending feedback requests
const pendingFeedbacks = new Set();

// Send a feedback to the special users
function sendFeedbackToSpecialUsers(feedback, username, firstName, userId) {
  const feedbackMessage = `
    📝 بازخورد جدید:
    👤 کاربر: ${username ? '@' + username : 'ناشناس'}
    🏷 نام: ${firstName}
    🆔 شناسه: ${userId}
    🗨️ بازخورد: ${feedback}
  `;

  specialUsers.forEach(specialUserId => {
    sendMessage(specialUserId, feedbackMessage, {
      inline_keyboard: [
        [
          { text: '📤 فوروارد بازخورد', callback_data: `forward_feedback_${userId}_${encodeURIComponent(feedback)}` }
        ]
      ]
    });
  });
}

// Process the feedback submission
function processFeedback(msg, feedback) {
  const chatId = msg.chat.id;
  const username = msg.from.username;
  const firstName = msg.from.first_name;
  const userId = msg.from.id;

  // Check if the user has already given feedback today
  const today = moment().format('jYYYY/jMM/jDD');
  if (feedbacks[userId] && feedbacks[userId].date === today) {
    sendMessage(chatId, '❗ شما قبلاً امروز بازخورد داده‌اید.');
    return;
  }

  // Remove from pending feedbacks if exists
  pendingFeedbacks.delete(userId);

  // Save feedback for the user
  feedbacks[userId] = { feedback, date: today };

  // Send the feedback to special users
  sendFeedbackToSpecialUsers(feedback, username, firstName, userId);

  sendMessage(chatId, '✅ بازخورد شما ارسال شد. از شما متشکریم!');
}

// Start Command
function handleStart(msg) {
  const chatId = msg.chat.id;

  const greetingMessage = `
  سلام ${msg.from.first_name} عزیز! 👋
  
  🕒 زمان کنونی: ${toPersianNumerals(moment().format('jHH:mm'))} - ${toPersianNumerals(moment().format('jDD/jMM/jYYYY'))}
  
  لطفاً رباتی که می‌خواهید بازخورد دهید را انتخاب کنید. 🤖
  `;

  const options = {
    inline_keyboard: [
      [{ text: '🔽 ربات آپلود | uploadd_bot', callback_data: 'uploader_info' }]
    ]
  };

  sendMessage(chatId, greetingMessage, options);
}

// Handle incoming messages
function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text || '';

  // Start command (explicit check to ensure it works)
  if (text.trim() === '/start') {
    handleStart(msg);
    return;
  }

  // Feedback submission logic
  if (pendingFeedbacks.has(msg.from.id)) {
    processFeedback(msg, text);
    return;
  }

  if (text.startsWith('ارسال بازخورد')) {
    sendMessage(chatId, 'لطفاً بازخورد خود را وارد کنید: 📝');
    return;
  }
}

// Handle callback queries (buttons pressed)
function handleCallbackQuery(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const data = callbackQuery.data;

  if (data === 'uploader_info') {
    const botInfo = `
    🔹 نام: •آ‌پــلــودر | 𝙪𝙥𝙡𝙤𝙖𝙙𝙚𝙧•
    🔹 شناسه: @uploadd_bot
    🔹 هدف: آپلود و مدیریت فایل به شیوه‌ای آسان و مدرن! 📂🚀
    `;

    const options = {
      inline_keyboard: [
        [{ text: '📝 ارسال بازخورد', callback_data: 'send_feedback' }],
        [{ text: '🔙 بازگشت', callback_data: 'back_to_start' }]
      ]
    };

    editMessage(chatId, messageId, botInfo, options);
  }

  if (data === 'send_feedback') {
    sendMessage(chatId, 'لطفاً بازخورد خود را وارد کنید: 📝');
    pendingFeedbacks.add(callbackQuery.from.id);
  }

  if (data.startsWith('forward_feedback_')) {
    const [, userId, encodedFeedback] = data.split('_');
    const feedback = decodeURIComponent(encodedFeedback);
    
    // Forward logic can be implemented here if needed
    sendMessage(chatId, `بازخورد با موفقیت فوروارد شد:\n${feedback}`);
  }

  if (data === 'back_to_start') {
    handleStart(callbackQuery.message);
  }
}

// Poll for new messages
function pollMessages() {
  axios.post(`${apiUrl}getUpdates`)
    .then(response => {
      const updates = response.data.result;
      updates.forEach(update => {
        if (update.message) {
          handleMessage(update.message);
        }
        if (update.callback_query) {
          handleCallbackQuery(update.callback_query);
        }
      });
    })
    .catch(error => {
      console.error('Error getting updates:', error);
    });
}

// Start polling
setInterval(pollMessages, 1000); // Poll every second
