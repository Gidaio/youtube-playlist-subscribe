console.log("Injected!");

const searchParams = (new URL(window.location.href)).searchParams;
const playlistId = searchParams.get("list");

/**
 * Styles a particular element like a YouTube "subscribe" button based on the subscription state.
 * @param {Element} buttonElement The element to style.
 * @param {boolean} subscribed Whether or not you're subscribed.
 */
function styleSubscribeButton(buttonElement, subscribed) {
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
function subscribe() {
    chrome.runtime.sendMessage({
        type: "subscribe",
        id: playlistId
    }, response => {
        if(response.success) {
            // Make the button an unsubscribe button.
            let subscribeButton = document.getElementById("playlist-subscribe");
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
function unsubscribe() {
    // Tell the background script to unsubscribe us.
    chrome.runtime.sendMessage({
        type: "unsubscribe",
        id: playlistId
    }, response => {
        if(response.success) {
            // Make the button a subscribe button.
            let subscribeButton = document.getElementById("playlist-subscribe");
            styleSubscribeButton(subscribeButton, false);
        }
        else {
            alert(response.message);
        }
    });
}

console.log("Getting data...");

// Check to see if we're already subscribed to this playlist, and create a button reflecting this.
chrome.storage.local.get("playlists", storedData => {
    console.log("Stored data:", storedData);
    let playlists = storedData.playlists;
    let isSubscribed;

    if(playlists === undefined || Object.keys(playlists).length === 0) {
        isSubscribed = false;
    }
    else {
        isSubscribed = playlists[playlistId] !== undefined;
    }

    console.log("Subscribed?", isSubscribed);

    let subscribeButton = document.createElement("button");
    subscribeButton.id = "playlist-subscribe";
    
    styleSubscribeButton(subscribeButton, isSubscribed);

    console.log("Button:", subscribeButton);

    let injectingElement = document.getElementById("top-level-buttons");
    console.log("Injecting element:", injectingElement);
    injectingElement.appendChild(subscribeButton);
});
