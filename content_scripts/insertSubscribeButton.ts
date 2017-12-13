import { MessageType, Message } from "../types/messages";

const searchParams = (new URL(window.location.href)).searchParams;
const playlistId = searchParams.get("list");

/**
 * Styles a particular element like a YouTube "subscribe" button based on the subscription state.
 * @param buttonElement The element to style.
 * @param subscribed Whether or not you're subscribed.
 */
function styleSubscribeButton(buttonElement: HTMLButtonElement, subscribed: boolean) : void {
    if(subscribed) {
        buttonElement.textContent = "SUBSCRIBED";
        buttonElement.className = "subscribed";
        buttonElement.onclick = unsubscribe;
    }
    else {
        buttonElement.textContent = "SUBSCRIBE";
        buttonElement.className = "not-subscribed";
        buttonElement.onclick = subscribe;
    }
}

/**
 * Sends a message to the background script to subscribe to the current playlist, and styles the
 * button if the subscription was successful.
 */
function subscribe() : void {
    let message: Message = {
        type: MessageType.Subscribe,
        id: playlistId
    };

    chrome.runtime.sendMessage(message, response => {
        if(response.success) {
            // Make the button an unsubscribe button.
            let subscribeButton =
                    document.getElementById("playlist-subscribe") as HTMLButtonElement;
            styleSubscribeButton(subscribeButton, true);
        }
        else {
            alert(response.message);
        }
    });
}

/**
 * Sends a message to the background script to unsubscribe from the current playlist, and styles the
 * button if the unsubscription was successful.
 */
function unsubscribe() : void {
    // Tell the background script to unsubscribe us.
    let message: Message = {
        type: MessageType.Unsubscribe,
        id: playlistId
    };

    chrome.runtime.sendMessage(message, response => {
        if(response.success) {
            // Make the button a subscribe button.
            let subscribeButton =
                    document.getElementById("playlist-subscribe") as HTMLButtonElement;
            styleSubscribeButton(subscribeButton, false);
        }
        else {
            alert(response.message);
        }
    });
}

console.log("Getting data...");

// Check to see if we're already subscribed to this playlist, and create a button reflecting this.
let message: Message = {
    type: MessageType.IsSubscribed,
    id: playlistId
};

chrome.runtime.sendMessage(message, response => {
    if(response.success) {
        console.log("Subscribed?", response.data);
        
        let subscribeButton = document.createElement("button");
        subscribeButton.id = "playlist-subscribe";
        
        styleSubscribeButton(subscribeButton, response.data);
    
        console.log("Button:", subscribeButton);
    
        let injectingElement = document.getElementById("top-level-buttons");
        console.log("Injecting element:", injectingElement);
        injectingElement.appendChild(subscribeButton);
    }
    else {
        alert(response.message);
    }
});
