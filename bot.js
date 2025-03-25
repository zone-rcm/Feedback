const axios = require('axios');
const moment = require('moment-jalaali');

// IMPORTANT: REPLACE THIS WITH YOUR ACTUAL BOT TOKEN - KEEP IT SECRET!
const BOT_TOKEN = '1355028807:FpSzen2exQIhLI47fQtyQVDZjO5Xr99P4ELXCc42';

// Bot configuration
const config = {
  apiBaseUrl: 'https://tapi.bale.ai/bot' + BOT_TOKEN + '/',
  specialUsers: [844843541],
  maxFeedbackPerDay: 1,
  pollInterval: 1000, // milliseconds
  updateOffset: 0
};

// Logging utility
const logger = {
  info: (message) => console.log(`[INFO] ${message}`),
  error: (message, error) => console.error(`[ERROR] ${message}`, error),
  warn: (message) => console.warn(`[WARN] ${message}`)
};

// Persian utilities
const persianUtils = {
  // Convert Arabic/English numerals to Persian
  toPersianNumerals(number) {
    const persianNumerals = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    return number.toString().split('').map(digit => persianNumerals[parseInt(digit)]).join('');
  },

  // Format date in Persian Jalaali calendar
  formatDate() {
    return moment().format('jYYYY/jMM/jDD ساعت HH:mm');
  }
};

// Feedback management
const feedbackManager = {
  // Store feedbacks to prevent multiple feedbacks per user per day
  feedbacks: {},

  canSubmitFeedback(userId) {
    const today = moment().format('jYYYY/jMM/jDD');
    const userFeedback = this.feedbacks[userId];
    
    // Check if user has already given feedback today
    if (userFeedback && userFeedback.date === today) {
      return false;
    }
    
    return true;
  },

  storeFeedback(userId, feedback) {
    const today = moment().format('jYYYY/jMM/jDD');
    this.feedbacks[userId] = { feedback, date: today };
  }
};

// Telegram API helpers
const telegramApi = {
  // Send a message to a specific chat
  async sendMessage(chatId, text, replyMarkup = {}) {
    try {
      const response = await axios.post(`${config.apiBaseUrl}sendMessage`, {
        chat_id: chatId,
        text: text,
        reply_markup: replyMarkup
      });
      return response.data;
    } catch (error) {
      logger.error('Failed to send message', error);
      throw new Error('Message sending failed');
    }
  },

  // Edit an existing message
  async editMessage(chatId, messageId, text, replyMarkup = {}) {
    try {
      const response = await axios.post(`${config.apiBaseUrl}editMessageText`, {
        chat_id: chatId,
        message_id: messageId,
        text: text,
        reply_markup: replyMarkup
      });
      return response.data;
    } catch (error) {
      logger.error('Failed to edit message', error);
      throw new Error('Message editing failed');
    }
  },

  // Send feedback to special users
  async sendFeedbackToSpecialUsers(feedback, username, firstName, userId) {
    const feedbackMessage = `
      📝 بازخورد جدید:
      👤 کاربر: @${username || 'ناشناس'}
      🏷 نام: ${firstName}
      🆔 شناسه: ${userId}
      🗨️ بازخورد: ${feedback}
    `;

    for (const specialUserId of config.specialUsers) {
      try {
        await this.sendMessage(specialUserId, feedbackMessage, {
          inline_keyboard: [
            [
              { text: '📤 فوروارد بازخورد', callback_data: `forward_feedback_${userId}` }
            ]
          ]
        });
      } catch (error) {
        logger.error(`Failed to send feedback to special user ${specialUserId}`, error);
      }
    }
  }
};

// Message handlers
const messageHandlers = {
  // Handle start command
  async handleStart(msg) {
    const chatId = msg.chat.id;
    const firstName = msg.from.first_name || 'کاربر';

    const greetingMessage = `
    سلام ${firstName} عزیز! 👋
    
    🕒 زمان کنونی: ${persianUtils.toPersianNumerals(moment().format('jHH:mm'))} - ${persianUtils.toPersianNumerals(moment().format('jDD/jMM/jYYYY'))}
    
    لطفاً رباتی که می‌خواهید بازخورد دهید را انتخاب کنید. 🤖
    `;

    const options = {
      inline_keyboard: [
        [{ text: '🔽 ربات آپلود | uploadd_bot', callback_data: 'uploader_info' }]
      ]
    };

    await telegramApi.sendMessage(chatId, greetingMessage, options);
  },

  // Process incoming messages
  async handleMessage(msg) {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Check if message is a feedback submission
    if (text && text.startsWith('ارسال بازخورد')) {
      await telegramApi.sendMessage(chatId, 'لطفاً بازخورد خود را وارد کنید: 📝');
      return;
    }

    // Process actual feedback
    if (text && text.trim().length > 0) {
      await this.processFeedback(msg, text);
    }
  },

  // Process feedback submission
  async processFeedback(msg, feedback) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || '';
    const firstName = msg.from.first_name || 'کاربر';

    // Check if user can submit feedback
    if (!feedbackManager.canSubmitFeedback(userId)) {
      await telegramApi.sendMessage(chatId, '❗ شما قبلاً امروز بازخورد داده‌اید.');
      return;
    }

    // Store and send feedback
    feedbackManager.storeFeedback(userId, feedback);
    await telegramApi.sendFeedbackToSpecialUsers(feedback, username, firstName, userId);
    await telegramApi.sendMessage(chatId, '✅ بازخورد شما ارسال شد. از شما متشکریم!');
  },

  // Handle callback queries (button presses)
  async handleCallbackQuery(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const data = callbackQuery.data;

    switch (data) {
      case 'uploader_info':
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

        await telegramApi.editMessage(chatId, messageId, botInfo, options);
        break;

      case 'send_feedback':
        await telegramApi.sendMessage(chatId, 'لطفاً بازخورد خود را وارد کنید: 📝');
        break;

      case 'back_to_start':
        await this.handleStart(callbackQuery.message);
        break;

      default:
        // Handle other callback queries if needed
        if (data.startsWith('forward_feedback_')) {
          // Placeholder for future implementation of feedback forwarding
          logger.info(`Feedback forwarding requested: ${data}`);
        }
    }
  }
};

// Main polling function to get updates
async function pollMessages() {
  try {
    const response = await axios.post(`${config.apiBaseUrl}getUpdates`, {
      offset: config.updateOffset,
      timeout: 30 // Long polling timeout
    });

    const updates = response.data.result;
    
    if (updates && updates.length > 0) {
      // Update offset to get next batch of updates
      config.updateOffset = updates[updates.length - 1].update_id + 1;

      // Process each update
      for (const update of updates) {
        try {
          if (update.message) {
            await messageHandlers.handleMessage(update.message);
          }
          if (update.callback_query) {
            await messageHandlers.handleCallbackQuery(update.callback_query);
          }
        } catch (handlerError) {
          logger.error('Error processing update', handlerError);
        }
      }
    }
  } catch (error) {
    logger.error('Error getting updates', error);
  }
}

// Start the bot
function startBot() {
  logger.info('Bot started. Listening for updates...');
  // Use more efficient long polling instead of constant interval
  function startPolling() {
    pollMessages().then(() => {
      setImmediate(startPolling);
    }).catch(error => {
      logger.error('Polling error', error);
      // Wait a bit before retrying in case of persistent errors
      setTimeout(startPolling, 5000);
    });
  }

  startPolling();
}

// Initialize and start the bot
startBot();
