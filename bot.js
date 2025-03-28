const axios = require('axios');

// Configuration
const BOT_TOKEN = '2124491577:SmMBycCEHXV5JzwfS8tKmM71Kmi4zlpcA8IxdFCs';
const TARGET_USERNAME = 'zonercm'; // Without @
const POLLING_INTERVAL = 300; // ms for near-instant responses
let LAST_UPDATE_ID = 0;

// Enhanced Persian responses database
const PERSIAN_RESPONSES = {
    // Greetings
    "سلام": ["سلام به شما 👋", "سلام دوست عزیز 🌹", "درود بر شما ✨"],
    "درود": ["درود بر شما 🙏", "سلامتی 😊", "درود فراوان 🌺"],
    "صبح بخیر": ["صبح شما هم بخیر ☀️", "صبح زیبایی داشته باشید 🌄", "صبح بخیر نوروزی 🌷"],
    
    // Common phrases
    "حالت چطوره؟": ["خوبم ممنون 😊", "عالی هستم 👍", "به لطف شما خوبم 🌟"],
    "خوبی؟": ["ممنون تو خوبی؟ 💖", "بله خدا رو شکر 🙌", "مرسی تو چطوری؟ 😄"],
    "مرسی": ["خواهش میکنم 🤗", "قابلی نداشت 💐", "خوشحالم که تونستم کمک کنم 🌈"],
    
    // Questions
    "چطوری؟": ["خوبم ممنون 😇", "همه چی رو راهه 🚀", "بهتر از این نمیشه 🎉"],
    "چه خبر؟": ["سلامتی 🙏", "همه چی آرومه 🕊️", "خبر خاصی نیست 🤷‍♂️"],
    
    // Farewells
    "خداحافظ": ["بدرود 👋", "موفق باشید 🍀", "به سلامت 💙"],
    "بای": ["خداحافظ ✌️", "تا بعد 🌙", "موفق باشی 🎯"],
    
    // Basic words
    "بله": ["آره 👍", "حتما 💯", "موافقم ✅"],
    "نه": ["نخیر 👎", "منفی ❌", "متاسفانه نه 😔"],
    "ممنون": ["خواهش میکنم 🤲", "قابلی نداشت 🌸", "خوشحالم کمک کردم 😊"],
    "لطفا": ["حتما 🙏", "با کمال میل 🌷", "چشم 👀"],
    
    // Time-related
    "ساعت چنده؟": ["متاسفانه ساعت ندارم ⏰", "لطفا از ساعت خودتون ببینید ⌚", "نمیدونم دقیقا 🤔"],
    "امروز چندمه؟": ["امروز روز خوبیه 📅", "تاریخ رو از تقویم ببینید 🗓️", "نمیدونم دقیقا 🤷‍♀️"],
    
    // Default responses
    "_default": ["متوجه نشدم 🤔", "لطفا واضح تر بگویید ❓", "میشه تکرار کنید؟ 🔄"]
};

// Function to get updates
async function getUpdates() {
    try {
        const response = await axios.get(`https://tapi.bale.ai/bot${BOT_TOKEN}/getUpdates`, {
            params: {
                offset: LAST_UPDATE_ID + 1,
                timeout: 30,
                allowed_updates: ['message']
            }
        });
        return response.data.result || [];
    } catch (error) {
        console.error('Error getting updates:', error.message);
        return [];
    }
}

// Function to reply to message
async function replyToMessage(chatId, messageId, text) {
    try {
        await axios.post(`https://tapi.bale.ai/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: text,
            reply_to_message_id: messageId,  // This makes it a reply
            parse_mode: 'HTML'
        });
    } catch (error) {
        console.error('Error replying to message:', error.message);
    }
}

// Enhanced response generator
function generateResponse(messageText) {
    messageText = messageText.trim().toLowerCase();
    
    // Remove Persian/Arabic characters that might cause issues
    const cleanedText = messageText.replace(/[َُِّٰٖٓ]/g, '');
    
    // Check for exact matches first
    if (PERSIAN_RESPONSES[cleanedText]) {
        const options = PERSIAN_RESPONSES[cleanedText];
        return options[Math.floor(Math.random() * options.length)];
    }
    
    // Check for partial matches with priority to longer phrases
    const matchingPhrases = Object.entries(PERSIAN_RESPONSES)
        .filter(([key]) => cleanedText.includes(key.toLowerCase()))
        .sort((a, b) => b[0].length - a[0].length); // Sort by length descending
    
    if (matchingPhrases.length > 0) {
        const responses = matchingPhrases[0][1];
        return responses[Math.floor(Math.random() * responses.length)];
    }
    
    // Default response
    const defaultResponses = PERSIAN_RESPONSES['_default'];
    return defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
}

// Main polling loop with improved error handling
async function poll() {
    try {
        const updates = await getUpdates();
        
        for (const update of updates) {
            LAST_UPDATE_ID = update.update_id;
            
            if (update.message && update.message.text) {
                const message = update.message;
                const username = message.from?.username;
                
                // Only respond to the target username
                if (username && username.toLowerCase() === TARGET_USERNAME.toLowerCase()) {
                    const responseText = generateResponse(message.text);
                    await replyToMessage(message.chat.id, message.message_id, responseText);
                }
            }
        }
    } catch (error) {
        console.error('Polling error:', error.message);
    } finally {
        // Continue polling with setImmediate for faster response
        setImmediate(poll);
    }
}

// Start the bot
console.log('🚀 Bot is running and ready to respond to @' + TARGET_USERNAME);
poll();
