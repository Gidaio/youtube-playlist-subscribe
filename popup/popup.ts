const basePlaylistURL = "https://www.youtube.com/playlist?list=";
let playlistsElement = document.getElementById("playlists-list");

/**
 * Clear's the badge on the browser action.
 */
function clearBadge() {
    chrome.browserAction.setBadgeText({ text: "" });
}

/**
 * Sets the badge on the browser action to green, with a number indicating the number of updates to
 * playlists.
 * @param {number} numberOfUpdates The number of updates to display.
 */
function setBadgeUpdates(numberOfUpdates) {
    console.log("I got " + numberOfUpdates + " as the number of updates");
    if(numberOfUpdates === 0) {
        clearBadge();
        return;
    }

    chrome.browserAction.setBadgeText({ text: numberOfUpdates.toString() });
    chrome.browserAction.setBadgeBackgroundColor({ color: [100, 100, 100, 255]});
}

/**
 * Runs through all of the playlists and totals the difference between each playlist's _total_ item
 * count vs. _read_ item count, then updates the badge accordingly.
 */
function updateBadgeCount() {
    chrome.storage.local.get("playlists", storedData => {
        const playlists = storedData.playlists;

        let totalCount = 0;

        for(let playlistId in playlists) {
            totalCount += playlists[playlistId].newItemCount - playlists[playlistId].itemCount;
        }

        setBadgeUpdates(totalCount);
    });
}

/**
 * Opens a page pointing to the playlist that was clicked on, as determined by the data on the
 * clicked element.
 * @param {Event} event The (probably Mouse)Event from the clickage.
 */
function openTab(event) {
    // Get the playlist ID from the button we clicked.
    const playlistId = event.target.dataset.playlistId;

    // If this guy has some updates, do special stuff.
    if(event.target.dataset.hasUpdates) {
        // Update the storage to mark this one as "read."
        chrome.storage.local.get("playlists", storedData => {
            let playlists = storedData.playlists;
            const newItemCount = playlists[playlistId].newItemCount;
            playlists[playlistId].itemCount = newItemCount;
            // And update the browser action's badge when we're done changing stuff.
            chrome.storage.local.set({ playlists: playlists }, () => {
                // Then remove the badge.
                event.target.removeChild(event.target.lastChild);

                updateBadgeCount();
                
                // Construct a URL from the playlist ID and open a new tab pointing to that playlist.
                const playlistURL = basePlaylistURL + playlistId;
                chrome.tabs.create({
                    url: playlistURL,
                    active: true
                });
            });
        });
    }
    else {
        // Construct a URL from the playlist ID and open a new tab pointing to that playlist.
        const playlistURL = basePlaylistURL + playlistId;
        chrome.tabs.create({
            url: playlistURL,
            active: true
        });
    }
}

/**
 * Unsubscribes from the playlist indicated by the data on the clicked element, and updates the list
 * as necessary.
 * @param {Event} event The (probably Mouse)Event from the clickage.
 */
function unsubscribe(event) {
    const playlistId = event.target.dataset.playlistId;
    console.log(event);
    console.log("Unsubscribing from playlist " + playlistId);

    // Delete the HTML element. This line deletes the playlist's button...
    playlistsElement.removeChild(event.target.previousElementSibling);
    // ... and this one deletes the button itself.
    playlistsElement.removeChild(event.target);

    // Remove the playlist from the "playlists" key in data.
    chrome.storage.local.get("playlists", storedData => {
        let playlists = storedData.playlists;

        delete playlists[playlistId];

        // If the playlists are now empty, add a little message.
        if(Object.keys(playlists).length === 0) {
            playlistsElement.textContent = "You aren't subscribed to any playlists!";
        }

        chrome.storage.local.set({ playlists: playlists });
    });
}

// This is the basic list set-up.
chrome.storage.local.get("playlists", storedData => {
    let playlists = storedData.playlists;

    // If there aren't any playlists, then show a simple message and return.
    if(playlists === undefined || Object.keys(playlists).length === 0) {
        playlistsElement.textContent = "You aren't subscribed to any playlists!";
        return;
    }

    for(let playlistId in playlists) {
        // For every playlist, make a new button with the playlist ID in its dataset.
        let playlistButton = document.createElement("button");
        playlistButton.className = "playlist";
        playlistButton.textContent = playlists[playlistId].title;
        playlistButton.dataset.playlistId = playlistId;
        playlistButton.onclick = openTab;

        // If there are new videos, add a badge.
        let newItemCount = playlists[playlistId].newItemCount;
        let oldItemCount = playlists[playlistId].itemCount;
        if(newItemCount > oldItemCount) {
            // Also, note on the button that there are updates, so we can remove them later.
            playlistButton.dataset.hasUpdates = true;
            const newCount = newItemCount - oldItemCount;
            let playlistBadge = document.createElement("div");
            playlistBadge.className = "badge";
            playlistBadge.textContent = newCount;
            playlistButton.appendChild(playlistBadge);
        }

        // Also create an "unsubscribe" button.
        let unsubscribeButton = document.createElement("button");
        unsubscribeButton.className = "remove";
        unsubscribeButton.innerHTML = "&times;";
        unsubscribeButton.dataset.playlistId = playlistId;
        unsubscribeButton.onclick = unsubscribe;

        // Then shove them into the div.
        playlistsElement.appendChild(playlistButton);
        playlistsElement.appendChild(unsubscribeButton);
    }
});
