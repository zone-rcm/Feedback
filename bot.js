const axios = require('axios');
const fs = require('fs');
const moment = require('moment-timezone');

// 🔐 Admin Usernames List
const ADMIN_USERNAMES = [
  'zonercm',
  'id_hormoz',
  'admin3_username'
];

// 🤖 Bot Configuration
const BOT_TOKEN = '1160037511:UNYPZY1GhLScNYpI1bLIJ77wayIqELOjtT48mbaJ';
const CHANNEL_ID = 5272323810; // Replace with your channel ID (use channel_id, not username)

class TelegramBot {
  constructor(token, channelId) {
    this.token = token;
    this.channelId = channelId;
    this.baseUrl = `https://tapi.bale.ai/bot${token}`;
    
    // Bot state management
    this.adminUsernames = ADMIN_USERNAMES;
    this.whitelistedUsers = [];
    this.startLinks = {};
    this.userIds = [];
    this.userStates = {};
    this.uploadedFiles = {};
    this.uploadedTexts = {};

    // Initialize bot
    this.initializeBot();
  }

  // Utility methods for JSON file management
  async saveJSON(filename, data) {
    await fs.writeFile(filename, JSON.stringify(data, null, 2), 'utf8');
  }

  async loadJSON(filename, defaultValue = []) {
    try {
      const data = await fs.readFile(filename, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      await this.saveJSON(filename, defaultValue);
      return defaultValue;
    }
  }

  // Generate unique start link
  generateStartLink() {
    return Math.random().toString(36).substring(2, 10);
  }

  // Get Persian date and time
  getPersianDateTime() {
    return moment().tz('Asia/Tehran').format('jYYYY/jMM/jDD - HH:mm:ss');
  }

  // Send message via Telegram Bot API
  async sendMessage(chatId, text, options = {}) {
    try {
      const response = await axios.post(`${this.baseUrl}/sendMessage`, {
        chat_id: chatId,
        text: text,
        ...options
      });
      return response.data;
    } catch (error) {
      console.error('Error sending message:', error.response ? error.response.data : error.message);
    }
  }

  // Check channel membership
  async checkChannelMembership(userId) {
    try {
      const response = await axios.get(`${this.baseUrl}/getChatMember`, {
        params: {
          chat_id: this.channelId,
          user_id: userId
        }
      });
      const status = response.data.result.status;
      return ['member', 'administrator', 'creator'].includes(status);
    } catch (error) {
      return false;
    }
  }

  // Send channel join message with inline keyboards
  async sendChannelJoinMessage(chatId) {
    const joinMessage = `⚠️ برای استفاده از ربات، ابتدا باید در کانال زیر عضو شوید:\n\n${this.channelId}`;
    
    await this.sendMessage(chatId, joinMessage, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔗 لینک کانال', url: `https://t.me/c/${Math.abs(this.channelId).toString().substring(4)}` },
            { text: '✅ بررسی عضویت', callback_data: 'check_channel_membership' }
          ]
        ]
      }
    });
  }

  // Initialize bot and start long polling
  async initializeBot() {
    // Load persistent data
    this.whitelistedUsers = await this.loadJSON('whitelist.json');
    this.startLinks = await this.loadJSON('start_links.json', {});
    this.userIds = await this.loadJSON('user_ids.json');
    this.uploadedFiles = await this.loadJSON('uploaded_files.json', {});
    this.uploadedTexts = await this.loadJSON('uploaded_texts.json', {});

    // Start long polling
    this.startPolling();
  }

  // Long polling method
  async startPolling(offset = 0) {
    try {
      const response = await axios.get(`${this.baseUrl}/getUpdates`, {
        params: {
          offset: offset,
          timeout: 30
        }
      });

      const updates = response.data.result;
      if (updates.length > 0) {
        for (const update of updates) {
          await this.handleUpdate(update);
          offset = update.update_id + 1;
        }
      }

      // Continue polling
      this.startPolling(offset);
    } catch (error) {
      console.error('Polling error:', error);
      // Restart polling after a short delay
      setTimeout(() => this.startPolling(offset), 1000);
    }
  }

  // Handle incoming updates
  async handleUpdate(update) {
    // Handle message updates
    if (update.message) {
      await this.handleMessage(update.message);
    }
    
    // Handle callback query updates
    if (update.callback_query) {
      await this.handleCallbackQuery(update.callback_query);
    }
  }

  // Handle incoming messages
  async handleMessage(message) {
    const chatId = message.chat.id;
    const userId = message.from.id;
    const firstName = message.from.first_name || 'کاربر';
    const username = message.from.username || '';

    // Store user ID if not already stored
    if (!this.userIds.includes(userId)) {
      this.userIds.push(userId);
      await this.saveJSON('user_ids.json', this.userIds);
    }

    // Check channel membership
    const isInChannel = await this.checkChannelMembership(userId);
    if (!isInChannel) {
      await this.sendChannelJoinMessage(chatId);
      return;
    }

    // Greet user
    if (message.text === '/start') {
      const greeting = `سلام ${firstName} 👋\n\n📅 تاریخ: ${this.getPersianDateTime()}\n\nخوش آمدید!`;
      await this.sendMessage(chatId, greeting);
      return;
    }

    // Admin panel access
    if (message.text === 'پنل' && this.adminUsernames.includes(username)) {
      await this.showAdminPanel(chatId);
      return;
    }

    // Handle start link for files/texts
    if (message.text && message.text.startsWith('/start ')) {
      const code = message.text.split(' ')[1];
      await this.handleStartLink(chatId, code);
      return;
    }

    // State-based handling for admin actions
    const state = this.userStates[userId];
    if (state && this.adminUsernames.includes(username)) {
      await this.handleAdminState(message, state);
    }
  }

  // Show admin panel
  async showAdminPanel(chatId) {
    const panelMessage = `🔧 پنل مدیریت\n\n${this.getPersianDateTime()}`;
    
    await this.sendMessage(chatId, panelMessage, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📁 آپلود فایل', callback_data: 'upload_file' }],
          [{ text: '📝 آپلود متن', callback_data: 'upload_text' }],
          [{ text: '📢 ارسال پیام به کاربران', callback_data: 'send_to_users' }],
          [{ text: '🖼️ ارسال تصویر', callback_data: 'send_image' }]
        ]
      }
    });
  }

  // Handle callback queries
  async handleCallbackQuery(callbackQuery) {
    const message = callbackQuery.message;
    const chatId = message.chat.id;
    const userId = callbackQuery.from.id;
    const username = callbackQuery.from.username || '';
    const data = callbackQuery.data;

    // Channel membership check
    if (data === 'check_channel_membership') {
      const isInChannel = await this.checkChannelMembership(userId);
      if (isInChannel) {
        await this.sendMessage(chatId, '✅ شما با موفقیت در کانال عضو شدید!');
        // Here you could re-run the last user command
      } else {
        await this.sendMessage(chatId, '❌ هنوز در کانال عضو نشده‌اید');
      }
      return;
    }

    // Admin panel actions
    if (!this.adminUsernames.includes(username)) return;

    switch (data) {
      case 'upload_file':
        this.userStates[userId] = 'waiting_for_file';
        await this.sendMessage(chatId, '📤 لطفا فایل مورد نظر را ارسال کنید');
        break;
      
      case 'upload_text':
        this.userStates[userId] = 'waiting_for_text';
        await this.sendMessage(chatId, '✍️ متن مورد نظر را بنویسید');
        break;
      
      case 'send_to_users':
        this.userStates[userId] = 'waiting_for_broadcast_text';
        await this.sendMessage(chatId, '📢 متن پیام همگانی را بنویسید');
        break;
      
      case 'send_image':
        this.userStates[userId] = 'waiting_for_broadcast_image';
        await this.sendMessage(chatId, '🖼️ تصویر مورد نظر را ارسال کنید');
        break;
    }
  }

  // Handle admin state actions
  async handleAdminState(message, state) {
    const userId = message.from.id;
    const chatId = message.chat.id;

    switch (state) {
      case 'waiting_for_file':
        if (message.document) {
          // Save file
          const fileId = message.document.file_id;
          const fileName = message.document.file_name;
          
          // Generate unique start link
          const startLink = this.generateStartLink();
          
          // Save file details
          this.uploadedFiles[startLink] = { fileId, fileName };
          await this.saveJSON('uploaded_files.json', this.uploadedFiles);
          
          // Send start link to admin
          await this.sendMessage(chatId, `🔗 لینک دانلود فایل: /start ${startLink}`);
          
          // Reset state
          delete this.userStates[userId];
        }
        break;

      case 'waiting_for_text':
        if (message.text) {
          // Generate unique start link
          const startLink = this.generateStartLink();
          
          // Save text
          this.uploadedTexts[startLink] = message.text;
          await this.saveJSON('uploaded_texts.json', this.uploadedTexts);
          
          // Send start link to admin
          await this.sendMessage(chatId, `🔗 لینک متن: /start ${startLink}`);
          
          // Reset state
          delete this.userStates[userId];
        }
        break;

      case 'waiting_for_broadcast_text':
        if (message.text) {
          // Send to all stored user IDs
          for (const uid of this.userIds) {
            await this.sendMessage(uid, message.text);
          }
          
          await this.sendMessage(chatId, '✅ پیام به همه کاربران ارسال شد');
          delete this.userStates[userId];
        }
        break;

      case 'waiting_for_broadcast_image':
        if (message.photo) {
          // Get the largest photo
          const photo = message.photo[message.photo.length - 1];
          const caption = message.caption || '';

          // Send to all stored user IDs
          for (const uid of this.userIds) {
            await this.sendMessage(uid, caption, {
              photo: photo.file_id,
              caption: caption
            });
          }
          
          await this.sendMessage(chatId, '✅ تصویر به همه کاربران ارسال شد');
          delete this.userStates[userId];
        }
        break;
    }
  }

  // Handle start links for files/texts
  async handleStartLink(chatId, code) {
    // Check if code exists in files
    if (this.uploadedFiles[code]) {
      const fileInfo = this.uploadedFiles[code];
      await this.sendFile(chatId, fileInfo.fileId);
      return;
    }

    // Check if code exists in texts
    if (this.uploadedTexts[code]) {
      const text = this.uploadedTexts[code];
      await this.sendMessage(chatId, text);
      return;
    }

    // Invalid link
    await this.sendMessage(chatId, '❌ لینک نامعتبر است');
  }

  // Send file method
  async sendFile(chatId, fileId) {
    try {
      await axios.post(`${this.baseUrl}/sendDocument`, {
        chat_id: chatId,
        document: fileId
      });
    } catch (error) {
      console.error('Error sending file:', error);
    }
  }
}

// Initialize and start the bot
const bot = new TelegramBot(BOT_TOKEN, CHANNEL_ID);

console.log('🤖 Bot started successfully! 🚀');
