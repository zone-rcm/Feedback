const axios = require("axios");

const BOT_TOKEN = "2124491577:SmMBycCEHXV5JzwfS8tKmM71Kmi4zlpcA8IxdFCs"; // Replace with your bot token
const API_URL = `https://tapi.bale.ai/bot${BOT_TOKEN}`;
const USERNAME_ALLOWED = "zonercm";

// Responses based on specific words
const responses = {
  "سلام": "سلام! چطوری؟",
  "چطوری": "خوبم، مرسی! تو چطوری؟",
  "خبر": "همه چیز خوبه، تو چی؟",
  "کمک": "چطور میتونم کمکت کنم؟",
  "خداحافظ": "خداحافظ! موفق باشی!",
  "مرسی": "خواهش میکنم!",
  "صبح بخیر": "صبح بخیر! روز خوبی داشته باشی.",
  "شب بخیر": "شب بخیر! خوابی راحت داشته باشی.",
  "خوبی؟": "بله، خوبم! مرسی که پرسیدی.",
  "باشه": "باشه، حتما!",
  "خوب": "خوبه! :)
};

// Function to get a response based on the message
const getResponse = (message) => {
  const text = message.toLowerCase();
  for (const [key, value] of Object.entries(responses)) {
    if (text.includes(key)) {
      return value;
    }
  }
  return "متاسفم، متوجه نشدم."; // Default response if no match
};

// Function to get updates and respond
async function getUpdates(offset = 0) {
  try {
    const res = await axios.get(`${API_URL}/getUpdates`, { params: { offset, timeout: 5 } });

    if (res.data.ok) {
      res.data.result.forEach(async (update) => {
        if (update.message) {
          const msg = update.message;
          const username = msg.from.username;

          if (username === USERNAME_ALLOWED) {
            const chatId = msg.chat.id;
            const responseText = getResponse(msg.text);

            await axios.post(`${API_URL}/sendMessage`, {
              chat_id: chatId,
              text: responseText
            });
          }
        }
        offset = update.update_id + 1;
      });
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
  setTimeout(() => getUpdates(offset), 100);
}

getUpdates();
