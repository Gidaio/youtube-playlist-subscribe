import { StoredPlaylist, Playlist, PlaylistResponse } from "../types/playlist";
import { MessageType, MessageResponse } from "../types/messages";

// Just some good ol' constants.
const apiKey = "AIzaSyDWbZUFpvo4eKV-zLCPVK2h4Q4F0QZ9x6s";
const baseURL = "https://www.googleapis.com/youtube/v3/";

// The format for the data is going to be something like this:
// "{playlistId}": {
//     "newItemCount": number,
//     "itemCount": number,
//     "title": string
// },
// "recentError: {}"

/**
 * A helper function for getting data from Chrome's storage.
 * @param storageKey The key of the data to get.
 * @returns A Promise response containing the data at the key.
 */
function storageGet(storageKey: string) : Promise<any> {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(storageKey, data => {
            if(chrome.runtime.lastError) {
                reject(chrome.runtime.lastError.message);
            }
            else {
                resolve(data[storageKey]);
            }
        });
    });
}

/**
 * A helper function for storing data in Chrome's storage.
 * @param storageKey The key to store the data in.
 * @param storageData The data to store at the key.
 * @returns An empty promise when the write resolves.
 */
function storageSet(storageKey: string, storageData: any) : Promise<string> {
    let storageObject: any = {};
    storageObject[storageKey] = storageData;
    return new Promise((resolve, reject) => {
        chrome.storage.local.set(storageObject, () => {
            if(chrome.runtime.lastError) {
                reject(chrome.runtime.lastError.message);
            }
            else {
                resolve();
            }
        });
    });
}

/**
 * Clear's the badge on the browser action.
 */
function clearBadge() : void {
    chrome.browserAction.setBadgeText({ text: "" });
}

/**
 * Sets the badge on the browser action to green, with a number indicating the number of updates to
 * playlists.
 * @param numberOfUpdates The number of updates to display.
 */
function setBadgeUpdates(numberOfUpdates: number) : void {
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
function setBadgeError() : void {
    chrome.browserAction.setBadgeText({ text: "!" });
    chrome.browserAction.setBadgeBackgroundColor({ color: [255, 0, 0, 255] });
}

/**
 * Builds a URL suitable for querying the YouTube Data API.
 * @param type The thing to query. Usually either "playlists" or "playlistItems".
 * @param parameters An object of key-value pairs to be converted to key-value pairs in the URL
 * request.
 * @returns A string containing the constructed URL.
 */
function buildRequestURL(type: string, parameters: any) : string {
    let requestURL = baseURL + type + "?";

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
 * @param type The thing to query. Usually either "playlists" or "playlistItems".
 * @param parameters An object of key-value pairs to be converted to key-value pairs in the URL
 * request. This should not contain the API key; it's added automatically.
 * @returns A promise containing the XHR.
 */
function doRequest(type: string, parameters: any) : Promise<PlaylistResponse> {
    return new Promise((resolve, reject) => {
        // Add the API key in, and build the URL.
        parameters.key = apiKey;
        const requestURL = buildRequestURL(type, parameters);

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
 * @param playlistId The ID of the playlist to subscribe to.
 * @returns A Promise that resolves with a boolean indicating whether or not the request was
 * successful.
 */
function subscribe(playlistId: string) : Promise<boolean> {
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

        // Add the playlist to local storage. See above for the "database schema."
        const id = data.items[0].id;
        const playlist: StoredPlaylist = {
            title: data.items[0].snippet.title,
            itemCount: data.items[0].contentDetails.itemCount,
            readItemCount: data.items[0].contentDetails.itemCount
        }

        return storageSet(id, playlist);
    })
    .then(() => {
        return true;
    })
    .catch(error => {
        // Otherwise, log the error and change the badge to let them know something went wrong.
        error.displayableMessage = "Sorry, we couldn't add your playlist. D:";
        console.error(error);
        storageSet("recentError", error);
        setBadgeError();

        return false;
    });
}

/**
 * Unsubscribes from the indicated playlist by removing it from the browser's storage.
 * @param playlistId The "indicated playlist."
 */
function unsubscribe(playlistId) : void {
    console.log("Unsubscribing from playlist " + playlistId);

    // Remove the playlist.
    chrome.storage.local.remove(playlistId);
}

/**
 * Fetches information about each playlist and updates said information if necessary.
 * @param alarm The alarm that triggered this function. Only calls from "Playlist Updater" are
 * honored.
 */
function updatePlaylists(alarm?: any) : void {
    // If an alarm was passed in, check it's name. If it's not the right alarm, forget we ever said
    // anything.
    if(alarm) {
        if(alarm.name !== "Playlist Updater") {
            return;
        }
    }

    console.log("Updating playlists!");

    storageGet(null)
    .then(storedPlaylists => {
        // Get all the IDs out!
        let playlistIds: string[] = [];

        for(let playlistId in storedPlaylists) {
            // If there's an error, don't do anything with that.
            if(playlistId === "recentError") {
                continue;
            }

            playlistIds.push(playlistId);
        }

        // If there weren't any playlists, stop here.
        if(playlistIds.length === 0) {
            return;
        }

        // Then build a request with all of the IDs joined by commas.
        const requestParameters = {
            part: "id,contentDetails,snippet",
            fields: "items(id,contentDetails/itemCount,snippet/title)",
            id: playlistIds.join(",")
        };

        doRequest("playlists", requestParameters)
        .then(fetchedPlaylists => {
            // If we had a success, remove any errors.
            chrome.storage.local.remove("recentError");

            // Once we get the data, run through it all.
            let totalUpdated = 0;

            fetchedPlaylists.items.forEach(fetchedPlaylist => {
                // Also, keep track if anything changed.
                let changes = false;

                const id = fetchedPlaylist.id;
                let storedPlaylist = storedPlaylists[id] as StoredPlaylist;
                console.log("Updating playlist " + id);
                
                const currentCount = fetchedPlaylist.contentDetails.itemCount;
                const readCount = storedPlaylist.readItemCount;

                // Check to see if the name changed. Most of the time, it's going to be the same.
                // But hey! If it's not, well, I get to say I support that.
                if(storedPlaylist.title !== fetchedPlaylist.snippet.title) {
                    storedPlaylist.title = fetchedPlaylist.snippet.title;
                    changes = true;
                }

                // If there are more now than there were, add the difference to the amount updated,
                // and store the "new" amount. That way, we know how many are new since the user
                // last checked it. We'll update it in the little popup.
                if(currentCount > readCount) {
                    totalUpdated += currentCount - readCount;
                    storedPlaylist.itemCount = currentCount;
                    changes = true;
                }
                // If it's smaller than when the user last looked at it, save those smaller values
                // and move on as if nothing happened. The user's (probably) not particularly
                // interested if the number goes down, but we need to hang on to it just in case.
                else if(currentCount < readCount) {
                    storedPlaylist.itemCount = currentCount;
                    storedPlaylist.readItemCount = currentCount;
                    changes = true;
                }

                // If anything changed, go ahead and save it back to the storage.
                if(changes) {
                    storageSet(id, storedPlaylist);
                }
            });

            // If there were some playlists that changed, update the badge.
            if(totalUpdated > 0) {
                setBadgeUpdates(totalUpdated);
            }
        })
        .catch(error => {
            error.displayableMessage = "Something went wrong fetching your playlist updates. :'(";
            console.error(error);
            storageSet("recentError", error);
            setBadgeError();
        });
    });
}

// Start by making sure the badge and storage are all clear.
chrome.storage.local.clear();
clearBadge();

// Do an initial update, because they, i.e., just started the browser.
updatePlaylists();

// Set up the updating alarm.
chrome.alarms.create("Playlist Updater", { delayInMinutes: 1, periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(updatePlaylists);

// Then add listeners for messages passed from the content script.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if(request.type === MessageType.Subscribe) {
        subscribe(request.id)
        .then(successful => {
            if(successful) {
                sendResponse(<MessageResponse>{ success: true });
            }
            else {
                sendResponse(<MessageResponse>{
                    success: false,
                    message: "Looks like we borked that one up!"
                });
            }
        });
    }
    else if(request.type === MessageType.Unsubscribe) {
        unsubscribe(request.id);
        sendResponse(<MessageResponse>{ success: true });
    }
    else if(request.type === MessageType.IsSubscribed) {
        storageGet(request.id)
        .then(playlist => {
            let response: MessageResponse = {
                success: true
            };

            if(playlist) {
                response.data = true;
            }
            else {
                response.data = false;
            }

            sendResponse(response);
        })
        .catch(error => {
            let response: MessageResponse = {
                success: false,
                message: "Something went wrong!"
            };

            sendResponse(response);
        });
    }

    // Return true so the sender knows we got it and are potentially sending a response
    // asynchronously.
    return true;
});
