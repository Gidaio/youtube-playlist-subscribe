// Just some good ol' constants.
const apiKey = "AIzaSyDWbZUFpvo4eKV-zLCPVK2h4Q4F0QZ9x6s";
const baseURL = "https://www.googleapis.com/youtube/v3/";

// For now, reset the data every time.
chrome.storage.local.clear();

// The format for the data is going to be something like this:
// "playlists": {
//     "{playlistId}": {
//         "newItemCount": number,
//         "itemCount": number,
//         "title": string
//     }
// },
// "recentError: {}"

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
    }

    chrome.browserAction.setBadgeText({ text: numberOfUpdates.toString() });
    chrome.browserAction.setBadgeBackgroundColor({ color: [100, 100, 100, 255]});
}

/**
 * Sets the badge on the browser action to a red "!", signifying an error.
 */
function setBadgeError() {
    chrome.browserAction.setBadgeText({ text: "!" });
    chrome.browserAction.setBadgeBackgroundColor({ color: [255, 0, 0, 255] });
}

/**
 * Builds a URL suitable for querying the YouTube Data API.
 * @param {string} thing The thing to query. Usually either "playlists" or "playlistItems".
 * @param {*} parameters An object of key-value pairs to be converted to key-value pairs in the URL
 * request.
 * @returns {string} A string containing the constructed URL.
 */
function buildRequestURL(thing, parameters) {
    let requestURL = baseURL + thing + "?";

    // For every key, make a <key>=<value> thing, making sure to sanitize the value properly.
    for(let key in parameters) {
        requestURL += key + "=";
        requestURL += encodeURIComponent(parameters[key]);
        requestURL += "&";
    }

    // Then, chop off the last "&" since we don't need it.
    return requestURL.substring(0, requestURL.length - 1);
}

/**
 * Performs an asynchronous XHR with the requested data.
 * @param {string} thing The thing to query. Usually either "playlists" or "playlistItems".
 * @param {*} parameters An object of key-value pairs to be converted to key-value pairs in the URL
 * request. This should not contain the API key; it's added automatically.
 * @returns {Promise} A promise containing the XHR.
 */
function doRequest(thing, parameters) {
    return new Promise((resolve, reject) => {
        // Add the API key in, and build the URL.
        parameters.key = apiKey;
        const requestURL = buildRequestURL(thing, parameters);

        // Then construct the XHR.
        const xhr = new XMLHttpRequest();
        xhr.open("GET", requestURL, true);

        xhr.onload = function() {
            // If we got a good status code, resolve with the data parsed as a JSON.
            if(this.status >= 200 && this.status < 400) {
                const data = JSON.parse(this.responseText);
                resolve(data);
            }
            // Otherwise, reject with the error parsed as a JSON.
            else {
                const error = JSON.parse(this.responseText);
                reject(error);
            }
        }

        xhr.onerror = function() {
            // If something went _really_ wrong, just send back the status and a maddeningly
            // ambiguous message.
            reject({
                statusCode: this.status,
                message: "Something went wrong and I don't know what!"
            });
        }

        xhr.send();
    });
}

/**
 * Fetches the current length of the playlist and adds it to the "playlists" object in local
 * storage.
 * @param {string} playlistId The ID of the playlist to subscribe to.
 * @returns {Promise<boolean>} A Promise that resolves with a boolean indicating whether or not the
 * request was successful.
 */
function subscribe(playlistId) {
    console.log("Subscribing to playlist " + playlistId);

    // Construct the parameters of the request. Like usual, we only need the ID and the item count.
    const requestParameters = {
        part: "id,contentDetails,snippet",
        fields: "items(id,contentDetails/itemCount,snippet/title)",
        id: playlistId
    };

    return doRequest("playlists", requestParameters)
    .then(data => {
        // If we had a success, remove any errors.
        chrome.storage.local.remove("recentError");

        // Add the playlist to local storage. See above for the "database schema." We have to first
        // get the data out as an object, then add the new playlist, then put it back in, because
        // there's no "update" method.
        chrome.storage.local.get("playlists", playlists => {
            playlists[data.items[0].id] = {
                newItemCount: data.items[0].contentDetails.itemCount,
                itemCount: data.items[0].contentDetails.itemCount,
                title: data.items[0].snippet.title
            };

            chrome.storage.local.set({ playlists: playlists });
        });

        return true;
    })
    .catch(error => {
        // Otherwise, log the error and change the badge to let them know something went wrong.
        error.displayableMessage = "Sorry, we couldn't add your playlist. D:";
        chrome.storage.local.set({ recentError: error });
        console.error(error);
        setBadgeError();

        return false;
    });
}

/**
 * Unsubscribes from the indicated playlist by removing it from the browser's storage.
 * @param {string} playlistId The "indicated playlist."
 */
function unsubscribe(playlistId) {
    console.log("Unsubscribing from playlist " + playlistId);

    // Remove the playlist from the "playlists" key in data.
    chrome.storage.local.get("playlists", storedData => {
        let playlists = storedData.playlists;

        if(playlists === undefined || Object.keys(playlists).length === 0) {
            return;
        }

        delete playlists[playlistId];

        chrome.storage.local.set({ playlists: playlists });
    });
}

/**
 * Fetches information about each playlist and updates said information if necessary.
 * @param {*} alarm The alarm that triggered this function. Only calls from "Playlist Updater" are
 * honored.
 */
function updatePlaylists(alarm) {
    // If an alarm was passed in, check it's name. If it's not the right alarm, forget we ever said
    // anything.
    if(alarm) {
        if(alarm.name !== "Playlist Updater") {
            return;
        }
    }

    console.log("Updating playlists!");

    // Run through all of the playlists and grab their IDs.
    chrome.storage.local.get("playlists", storedData => {
        // get() returns an object that looks like:
        // {
        //     playlists: {
        //         ... data...
        //     }
        // }
        // so we have to do this weird "dereferencing" thing.
        let storedPlaylists = storedData.playlists;

        // If there are no playlists, don't do anything!
        if(storedPlaylists === undefined || Object.keys(storedPlaylists).length === 0) {
            return;
        }

        let playlistIds = [];

        for(let playlistId in storedPlaylists) {
            playlistIds.push(playlistId);
        }

        // Then build a request with all of the IDs joined by commas.
        const requestParameters = {
            part: "id,contentDetails,snippet",
            fields: "items(id,contentDetails/itemCount,snippet/title)",
            id: playlistIds.join(",")
        };
    
        doRequest("playlists", requestParameters)
        .then(data => {
            // If we had a success, remove any errors.
            chrome.storage.local.remove("recentError");
    
            // Once we get the data, run through it all.
            let totalUpdated = 0;
            // Also, keep track if anything changed.
            let changes = false;
    
            data.items.forEach(fetchedPlaylist => {
                const id = fetchedPlaylist.id;
                console.log("Updating playlist " + id);
                const newCount = fetchedPlaylist.contentDetails.itemCount;
                const oldCount = storedPlaylists[id].itemCount;
    
                // Check to see if the name changed. Most of the time, it's going to be the same.
                // But hey! If it's not, well, I get to say I support that.
                if(storedPlaylists[id].title !== fetchedPlaylist.snippet.title) {
                    storedPlaylists[id].title = fetchedPlaylist.snippet.title;
                    changes = true;
                }
    
                // If there are more now than there were, add the difference to the amount updated,
                // and store the "new" amount. That way, we know how many are new since the user
                // last checked it. We'll update it in the little popup.
                if(newCount > oldCount) {
                    totalUpdated += newCount - oldCount;
                    storedPlaylists[id].newItemCount = newCount;
                    changes = true;
                }
                // If it's smaller than when the user last looked at it, save those smaller values
                // and move on as if nothing happened. The user's (probably) not particularly
                // interested if the number goes down, but we need to hang on to it just in case.
                else if(newCount < oldCount) {
                    storedPlaylists[id].newItemCount = newCount;
                    storedPlaylists[id].itemCount = newCount;
                    changes = true;
                }
            });

            // If stuff changed, save it all back.
            if(changes) {
                chrome.storage.local.set({ playlists: storedPlaylists });
            }
    
            // Then update the badge.
            if(totalUpdated > 0) {
                setBadgeUpdates(totalUpdated);
            }
        })
        .catch(error => {
            error.displayableMessage = "Something went wrong fetching your playlist updates. :'(";
            chrome.storage.local.set({ recentError: error });
            console.error(error);
            setBadgeError();
        });
    });

}

// Start by making sure the badge is all clear.
clearBadge();

// Do an initial update, because they, i.e., just started the browser.
updatePlaylists();

// Set up the updating alarm.
chrome.alarms.create("Playlist Updater", { delayInMinutes: 1, periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(updatePlaylists);

// Then add listeners for messages passed from the content script.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if(request.type === "subscribe") {
        subscribe(request.id)
        .then(successful => {
            if(successful) {
                sendResponse({ success: true });
            }
            else {
                sendResponse({ success: false, message: "Looks like we borked that one up!" });
            }
        })
    }
    else if(request.type === "unsubscribe") {
        unsubscribe(request.id);
        sendResponse({ success: true });
    }

    // Return true so the sender knows we got it and are potentially sending a response
    // asynchronously.
    return true;
});
