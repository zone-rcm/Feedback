const axios = require('axios');

// Replace with your actual bot token
const BOT_TOKEN = '2067752990:gboC2fk9euxXvO4nVp7hVUBhDLkG2wnKnePOiSVO';
const TELEGRAM_API = `https://tapi.bale.ai/bot${BOT_TOKEN}`;
let lastUpdateId = 0;

async function getUpdates() {
  try {
    const response = await axios.get(`${TELEGRAM_API}/getUpdates`, {
      params: {
        offset: lastUpdateId + 1,
        timeout: 30 // Long polling timeout
      }
    });

    const updates = response.data.result;
    if (updates.length > 0) {
      lastUpdateId = updates[updates.length - 1].update_id;
      processUpdates(updates);
    }

    // Immediately check for more updates
    getUpdates();
  } catch (error) {
    console.error('Error getting updates:', error.message);
    // Retry after a delay if there's an error
    setTimeout(getUpdates, 5000);
  }
}

function processUpdates(updates) {
  updates.forEach(update => {
    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text;

      if (text === '/start') {
        sendMessage(chatId, 'Hi!');
      }
    }
  });
}

async function sendMessage(chatId, text) {
  try {
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text: text
    });
  } catch (error) {
    console.error('Error sending message:', error.message);
  }
}

// Start the bot
console.log('Bot is running...');
getUpdates();
