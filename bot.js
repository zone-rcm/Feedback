const axios = require('axios');
const moment = require('moment-jalaali');

// IMPORTANT: REPLACE THIS WITH YOUR ACTUAL BOT TOKEN - KEEP IT SECRET!
const BOT_TOKEN = '1355028807:FpSzen2exQIhLI47fQtyQVDZjO5Xr99P4ELXCc42';

// Bot configuration
const config = {
  apiBaseUrl: 'https://tapi.bale.ai/bot' + BOT_TOKEN + '/',
  specialUsers: [844843541],
  maxFeedbackPerDay: 1,
  updateOffset: 0
};

// Simple logging utility
const logger = {
  info: (message) => console.log(`[INFO] ${message}`),
  error: (message, error) => console.error(`[ERROR] ${message}`, error)
};

// Persian utilities
const persianUtils = {
  toPersianNumerals(number) {
    const persianNumerals = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    return number.toString().split('').map(digit => persianNumerals[parseInt(digit)]).join('');
  }
};

// Feedback management
const feedbackManager = {
  feedbacks: {},

  canSubmitFeedback(userId) {
    const today = moment().format('jYYYY/jMM/jDD');
    const userFeedback = this.feedbacks[userId];
    
    return !(userFeedback && userFeedback.date === today);
  },

  storeFeedback(userId, feedback) {
    const today = moment().format('jYYYY/jMM/jDD');
    this.feedbacks[userId] = { feedback, date: today };
  }
};

// Telegram API helpers
const telegramApi = {
  async sendMessage(chatId, text, replyMarkup = null) {
    try {
      const payload = {
        chat_id: chatId,
        text: text
      };

      if (replyMarkup) {
        payload.reply_markup = replyMarkup;
      }

      await axios.post(`${config.apiBaseUrl}sendMessage`, payload);
    } catch (error) {
      logger.error('Failed to send message', error.response ? error.response.data : error.message);
    }
  },

  async editMessage(chatId, messageId, text, replyMarkup = null) {
    try {
      const payload = {
        chat_id: chatId,
        message_id: messageId,
        text: text
      };

      if (replyMarkup) {
        payload.reply_markup = replyMarkup;
      }

      await axios.post(`${config.apiBaseUrl}editMessageText`, payload);
    } catch (error) {
      logger.error('Failed to edit message', error.response ? error.response.data : error.message);
    }
  }
};

// Message handlers
const messageHandlers = {
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

  async handleFeedbackSubmission(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;

    // Validate feedback
    if (!text || text.trim().length === 0) {
      await telegramApi.sendMessage(chatId, 'لطفاً متن بازخورد را وارد کنید.');
      return false;
    }

    // Ignore specific commands and messages
    const ignoredMessages = [
      '/start', 
      'ارسال بازخورد', 
      '/help', 
      '/menu'
    ];

    if (ignoredMessages.includes(text.trim())) {
      return false;
    }

    // Check if user can submit feedback
    if (!feedbackManager.canSubmitFeedback(userId)) {
      await telegramApi.sendMessage(chatId, '❗ شما قبلاً امروز بازخورد داده‌اید.');
      return false;
    }

    // Store feedback
    feedbackManager.storeFeedback(userId, text);

    // Send feedback to special users
    const username = msg.from.username || 'ناشناس';
    const firstName = msg.from.first_name || 'کاربر';

    for (const specialUserId of config.specialUsers) {
      const feedbackMessage = `
📝 بازخورد جدید:
👤 کاربر: @${username}
🏷 نام: ${firstName}
🆔 شناسه: ${userId}
🗨️ بازخورد: ${text}
      `;

      await telegramApi.sendMessage(specialUserId, feedbackMessage);
    }

    // Confirm to the user
    await telegramApi.sendMessage(chatId, '✅ بازخورد شما ارسال شد. از شما متشکریم!');
    return true;
  },

  async handleCallbackQuery(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const data = callbackQuery.data;

    try {
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
          logger.info(`Unhandled callback: ${data}`);
      }
    } catch (error) {
      logger.error('Callback query error', error);
    }
  }
};

// Main polling function
async function pollMessages() {
  try {
    const response = await axios.post(`${config.apiBaseUrl}getUpdates`, {
      offset: config.updateOffset,
      timeout: 30
    });

    const updates = response.data.result || [];
    
    if (updates.length > 0) {
      // Update offset to get next batch of updates
      config.updateOffset = updates[updates.length - 1].update_id + 1;

      // Process each update
      for (const update of updates) {
        try {
          if (update.message) {
            const msg = update.message;
            
            // Handle start command
            if (msg.text === '/start') {
              await messageHandlers.handleStart(msg);
              continue;
            }

            // Try to handle as feedback
            await messageHandlers.handleFeedbackSubmission(msg);
          }

          // Handle callback queries
          if (update.callback_query) {
            await messageHandlers.handleCallbackQuery(update.callback_query);
          }
        } catch (updateError) {
          logger.error('Error processing update', updateError);
        }
      }
    }
  } catch (error) {
    logger.error('Error getting updates', error.response ? error.response.data : error.message);
  }
}

// Start the bot
function startBot() {
  logger.info('Bot started. Listening for updates...');
  
  function startPolling() {
    pollMessages().then(() => {
      setImmediate(startPolling);
    }).catch(error => {
      logger.error('Polling error', error);
      // Wait a bit before retrying
      setTimeout(startPolling, 5000);
    });
  }

  startPolling();
}

// Initialize and start the bot
startBot();
