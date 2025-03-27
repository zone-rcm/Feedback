const axios = require('axios');
const fs = require('fs');

// Configuration
const BOT_TOKEN = '471638936:wlWlUc869YCvTa6ATRuPr7NiMpIRC6j2e1NAkeAn';
const API_URL = `https://tapi.bale.ai/bot${BOT_TOKEN}`;
const WHITELIST_FILE = 'whitelist.json';
const CHANNELS_FILE = 'channels.json';
const POSTS_FILE = 'posts.json';

// Load or initialize data files
let whitelist = loadData(WHITELIST_FILE) || [];
let channels = loadData(CHANNELS_FILE) || [];
let posts = loadData(POSTS_FILE) || [];

// User session states
const userStates = {};

// Main polling function
let offset = 0;
async function pollUpdates() {
    try {
        const response = await axios.get(`${API_URL}/getUpdates`, {
            params: {
                offset,
                timeout: 30
            }
        });

        if (response.data.ok && response.data.result.length > 0) {
            for (const update of response.data.result) {
                offset = update.update_id + 1;
                handleUpdate(update);
            }
        }
    } catch (error) {
        console.error('Polling error:', error.message);
    } finally {
        setTimeout(pollUpdates, 1000);
    }
}

// Load data from file
function loadData(filename) {
    try {
        return JSON.parse(fs.readFileSync(filename));
    } catch (error) {
        return null;
    }
}

// Save data to file
function saveData(filename, data) {
    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
}

// Handle different types of updates
function handleUpdate(update) {
    if (update.message) {
        handleMessage(update.message);
    } else if (update.channel_post) {
        handleChannelPost(update.channel_post);
    } else if (update.my_chat_member) {
        handleChatMemberUpdate(update.my_chat_member);
    } else if (update.callback_query) {
        handleCallbackQuery(update.callback_query);
    }
}

// Handle new chat members (when bot is added to channels/groups)
function handleChatMemberUpdate(chatMember) {
    if (chatMember.new_chat_member.status === 'member' || chatMember.new_chat_member.status === 'administrator') {
        const chatId = chatMember.chat.id;
        const chatTitle = chatMember.chat.title;
        const chatType = chatMember.chat.type;
        
        // Check if channel already exists
        if (!channels.some(c => c.id === chatId)) {
            channels.push({
                id: chatId,
                title: chatTitle,
                type: chatType
            });
            saveData(CHANNELS_FILE, channels);
            console.log(`Bot added to new ${chatType}: ${chatTitle} (${chatId})`);
        }
    }
}

// Handle channel posts (for logging purposes)
function handleChannelPost(post) {
    console.log(`New post in channel ${post.chat.id}: ${post.text || 'media post'}`);
}

// Handle messages
function handleMessage(message) {
    const chatId = message.chat.id;
    const username = message.from.username;
    const text = message.text || '';
    const photo = message.photo;

    // Check if user is whitelisted
    if (!whitelist.includes(username)) {
        console.log(`Unauthorized access attempt by ${username}`);
        return;
    }

    // Check user state
    const userState = userStates[username] || { state: 'idle' };

    if (text === '/start') {
        sendMessage(chatId, 'Welcome to the management bot. Send "پنل" to open the panel.');
    } else if (text === 'پنل' && userState.state === 'idle') {
        showPanel(chatId, username);
    } else if (userState.state === 'waiting_for_post_type') {
        handlePostTypeSelection(chatId, username, text);
    } else if (userState.state === 'waiting_for_image') {
        handleImagePost(chatId, username, message);
    } else if (userState.state === 'waiting_for_text') {
        handleTextPost(chatId, username, text);
    } else if (userState.state === 'waiting_for_button_text') {
        handleButtonText(chatId, username, text);
    } else if (userState.state === 'waiting_for_button_url') {
        handleButtonUrl(chatId, username, text);
    } else if (userState.state === 'waiting_for_more_buttons') {
        handleMoreButtons(chatId, username, text);
    }
}

// Show management panel
function showPanel(chatId, username) {
    if (channels.length === 0) {
        sendMessage(chatId, 'No channels available. Add the bot to channels first.');
        return;
    }

    const buttons = channels.map(channel => ({
        text: channel.title,
        callback_data: `select_channel_${channel.id}`
    }));

    const keyboard = {
        inline_keyboard: chunkArray(buttons, 2)
    };

    sendMessage(chatId, 'Select a channel to post to:', keyboard);
    userStates[username] = { state: 'idle' };
}

// Handle post type selection
function handlePostTypeSelection(chatId, username, text) {
    if (text === 'Image with caption' || text === 'Text only') {
        userStates[username].postType = text === 'Image with caption' ? 'image' : 'text';
        
        if (userStates[username].postType === 'image') {
            sendMessage(chatId, 'Please send the image with caption now.');
            userStates[username].state = 'waiting_for_image';
        } else {
            sendMessage(chatId, 'Please send the text post now.');
            userStates[username].state = 'waiting_for_text';
        }
    } else {
        sendMessage(chatId, 'Invalid selection. Please choose "Image with caption" or "Text only".');
    }
}

// Handle image post
function handleImagePost(chatId, username, message) {
    if (!message.photo) {
        sendMessage(chatId, 'Please send an image.');
        return;
    }

    // Get the highest quality photo
    const photo = message.photo[message.photo.length - 1];
    const caption = message.caption || '';

    userStates[username].postData = {
        type: 'image',
        photo_file_id: photo.file_id,
        caption
    };

    sendMessage(chatId, 'Image received. Would you like to add buttons under the post? (yes/no)');
    userStates[username].state = 'waiting_for_more_buttons';
}

// Handle text post
function handleTextPost(chatId, username, text) {
    if (!text) {
        sendMessage(chatId, 'Please send the text content.');
        return;
    }

    userStates[username].postData = {
        type: 'text',
        text
    };

    sendMessage(chatId, 'Text received. Would you like to add buttons under the post? (yes/no)');
    userStates[username].state = 'waiting_for_more_buttons';
}

// Handle button creation
function handleMoreButtons(chatId, username, text) {
    if (text.toLowerCase() === 'yes') {
        sendMessage(chatId, 'Send the button text:');
        userStates[username].state = 'waiting_for_button_text';
        userStates[username].buttons = [];
    } else if (text.toLowerCase() === 'no') {
        finalizePost(chatId, username);
    } else {
        sendMessage(chatId, 'Please answer with "yes" or "no".');
    }
}

function handleButtonText(chatId, username, text) {
    if (!text) {
        sendMessage(chatId, 'Please send the button text.');
        return;
    }

    userStates[username].currentButton = { text };
    sendMessage(chatId, 'Now send the URL for this button:');
    userStates[username].state = 'waiting_for_button_url';
}

function handleButtonUrl(chatId, username, text) {
    if (!text || !text.startsWith('http')) {
        sendMessage(chatId, 'Please send a valid URL starting with http:// or https://');
        return;
    }

    userStates[username].currentButton.url = text;
    userStates[username].buttons.push(userStates[username].currentButton);
    
    sendMessage(chatId, 'Button added. Add another button? (yes/no)');
    userStates[username].state = 'waiting_for_more_buttons';
}

// Finalize and send the post
function finalizePost(chatId, username) {
    const userState = userStates[username];
    const channelId = userState.channelId;
    const postData = userState.postData;
    
    // Add buttons if any
    if (userState.buttons && userState.buttons.length > 0) {
        postData.buttons = userState.buttons;
    }
    
    // Save post data
    posts.push({
        channelId,
        username,
        data: postData,
        timestamp: new Date().toISOString()
    });
    saveData(POSTS_FILE, posts);
    
    // Send the post to the channel
    sendToChannel(channelId, postData);
    
    sendMessage(chatId, 'Post has been created and sent to the channel!');
    userStates[username] = { state: 'idle' };
}

// Handle callback queries (inline keyboard presses)
function handleCallbackQuery(callbackQuery) {
    const username = callbackQuery.from.username;
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (!whitelist.includes(username)) {
        answerCallbackQuery(callbackQuery.id, 'Unauthorized access.');
        return;
    }

    if (data.startsWith('select_channel_')) {
        const channelId = data.replace('select_channel_', '');
        const channel = channels.find(c => c.id === channelId);
        
        if (channel) {
            userStates[username] = {
                state: 'waiting_for_post_type',
                channelId
            };
            
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: 'Image with caption', callback_data: 'post_type_image' },
                        { text: 'Text only', callback_data: 'post_type_text' }
                    ]
                ]
            };
            
            editMessageText(chatId, callbackQuery.message.message_id, `Selected: ${channel.title}\nChoose post type:`, keyboard);
            answerCallbackQuery(callbackQuery.id);
        }
    } else if (data === 'post_type_image') {
        userStates[username].postType = 'image';
        editMessageText(chatId, callbackQuery.message.message_id, 'Please send the image with caption now.');
        answerCallbackQuery(callbackQuery.id);
        userStates[username].state = 'waiting_for_image';
    } else if (data === 'post_type_text') {
        userStates[username].postType = 'text';
        editMessageText(chatId, callbackQuery.message.message_id, 'Please send the text post now.');
        answerCallbackQuery(callbackQuery.id);
        userStates[username].state = 'waiting_for_text';
    }
}

// Send message to Telegram chat
async function sendMessage(chatId, text, replyMarkup = null) {
    try {
        await axios.post(`${API_URL}/sendMessage`, {
            chat_id: chatId,
            text,
            reply_markup: replyMarkup
        });
    } catch (error) {
        console.error('Error sending message:', error.message);
    }
}

// Edit message text
async function editMessageText(chatId, messageId, text, replyMarkup = null) {
    try {
        await axios.post(`${API_URL}/editMessageText`, {
            chat_id: chatId,
            message_id: messageId,
            text,
            reply_markup: replyMarkup
        });
    } catch (error) {
        console.error('Error editing message:', error.message);
    }
}

// Answer callback query
async function answerCallbackQuery(callbackQueryId, text = '') {
    try {
        await axios.post(`${API_URL}/answerCallbackQuery`, {
            callback_query_id: callbackQueryId,
            text
        });
    } catch (error) {
        console.error('Error answering callback query:', error.message);
    }
}

// Send post to channel
async function sendToChannel(channelId, postData) {
    try {
        if (postData.type === 'image') {
            await axios.post(`${API_URL}/sendPhoto`, {
                chat_id: channelId,
                photo: postData.photo_file_id,
                caption: postData.caption,
                reply_markup: postData.buttons ? createInlineKeyboard(postData.buttons) : undefined
            });
        } else if (postData.type === 'text') {
            await axios.post(`${API_URL}/sendMessage`, {
                chat_id: channelId,
                text: postData.text,
                reply_markup: postData.buttons ? createInlineKeyboard(postData.buttons) : undefined
            });
        }
    } catch (error) {
        console.error('Error sending to channel:', error.message);
    }
}

// Create inline keyboard from buttons
function createInlineKeyboard(buttons) {
    const keyboard = buttons.map(button => ({
        text: button.text,
        url: button.url
    }));
    
    return {
        inline_keyboard: chunkArray(keyboard, 2)
    };
}

// Helper function to split array into chunks
function chunkArray(array, size) {
    const result = [];
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
    }
    return result;
}

// Initialize whitelist if empty
if (whitelist.length === 0) {
    whitelist.push('zonercm'); // Add your username here
    saveData(WHITELIST_FILE, whitelist);
    console.log('Initialized whitelist with default username');
}

// Start polling
console.log('Bot is running...');
pollUpdates();
