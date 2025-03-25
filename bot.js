import requests
import time

# Replace with your actual bot token
BOT_TOKEN = "1355028807:TcPZyWc3GHRjCuJjAzLDR8SnJVrnmRVltA3FpFtY"
BASE_URL = f"https://tapi.bale.ai/bot{BOT_TOKEN}"
LAST_UPDATE_ID = 0

def get_updates():
    global LAST_UPDATE_ID
    try:
        response = requests.get(
            f"{BASE_URL}/getUpdates",
            params={"offset": LAST_UPDATE_ID + 1, "timeout": 30},
            timeout=35  # Slightly longer than the long polling timeout
        )
        response.raise_for_status()
        updates = response.json().get("result", [])
        
        if updates:
            LAST_UPDATE_ID = updates[-1]["update_id"]
            process_updates(updates)
            
    except requests.exceptions.RequestException as e:
        print(f"Error getting updates: {e}")
        time.sleep(5)  # Wait before retrying

def process_updates(updates):
    for update in updates:
        if "message" in update and "text" in update["message"]:
            chat_id = update["message"]["chat"]["id"]
            text = update["message"]["text"]
            
            if text == "/start":
                send_message(chat_id, "Hi!")

def send_message(chat_id, text):
    try:
        requests.post(
            f"{BASE_URL}/sendMessage",
            json={"chat_id": chat_id, "text": text}
        )
    except requests.exceptions.RequestException as e:
        print(f"Error sending message: {e}")

if __name__ == "__main__":
    print("Bot is running...")
    while True:
        get_updates()
