// --- Background Service Worker (background.js) ---

// Default base config (used only if custom retrieval fails unexpectedly)
const defaultBaseStreamfinderConfig = {
    "on_deck": "Y", "include_CLI": "N", "delay": "10000", "ignore": ["108"],
    "priority": [ {"type": "NoNo", "data": "7", "immediate": "", "priority": 1} ] // Example minimal default
};

// Variable to hold the base config for the current operation
let currentOperationContext = {
    baseConfig: null
};

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Background received message:", message.action, message); // Log action and message

    // Ignore messages originating from the background script itself
    if (sender.id === chrome.runtime.id) {
        return false;
    }

    if (message.action === "setBaseConfigContext") {
        // Store the base config string provided by the popup for the upcoming player processing
        console.log("Setting base config context");
        currentOperationContext.baseConfig = message.baseConfig;
        // Basic validation attempt
        try {
            if (message.baseConfig) {
                 JSON.parse(message.baseConfig); // Try parsing to catch early errors
                 console.log("Base config context set successfully.");
                 sendResponse({ status: "ok" });
            } else {
                 throw new Error("Received empty base config.");
            }
        } catch (e) {
             console.error("Error parsing base config context:", e);
             currentOperationContext.baseConfig = null; // Clear invalid config
             sendResponse({ status: "error", error: `Invalid base config format: ${e.message}` });
        }
        // Keep listener alive for sendResponse
        return true;

    } else if (message.action === "processPlayers") {
        console.log("Processing players request received.");
        // Retrieve the base config set earlier for this operation
        const baseConfigString = currentOperationContext.baseConfig;
        // Clear the context after retrieving it for this operation
        currentOperationContext.baseConfig = null;

        if (!baseConfigString) {
             console.error("Process players called but no base config context was set.");
             // Send error back to popup
             chrome.runtime.sendMessage({ action: "displayError", error: 'Internal Error: Base config context missing.' });
             sendResponse({ status: "Error", error: "Base config context missing" });
             return false; // No async response needed here
        }

        // Start the process of fetching IDs and generating the config using the provided base
        generateConfigFromPlayers(message.players, baseConfigString)
            .then(finalConfig => {
                // *** Generate date-stamped filename ***
                const today = new Date();
                // Format as YYYY-MM-DD
                const formattedDate = today.toISOString().slice(0, 10);
                const filename = `streamfinder_config_${formattedDate}.txt`;
                console.log(`Generated filename: ${filename}`);

                // Send the final config back to the popup for download with the new filename
                chrome.runtime.sendMessage({
                    action: "downloadFile",
                    content: JSON.stringify(finalConfig, null, 2),
                    filename: filename // Use the generated filename
                 });
                // Optional: Send response back to content script if needed
                sendResponse({ status: "Config generated and sent for download" });
            })
            .catch(error => {
                console.error("Error generating config:", error);
                // Send error details back to the popup
                chrome.runtime.sendMessage({ action: "displayError", error: `Error: ${error.message || 'Failed to generate config.'}` });
                // Optional: Send error back to content script
                sendResponse({ status: "Error", error: error.message });
            });
        // Keep listener alive for async operations within generateConfigFromPlayers
        return true;

    } else if (message.action === "extractionFailed") {
         console.log("Forwarding extraction failed message.");
         // Forward the extraction error to the popup
         chrome.runtime.sendMessage({ action: "displayError", error: `Extraction Error: ${message.error}` });
         // Clear any potentially lingering base config context on failure
         currentOperationContext.baseConfig = null;
         sendResponse({ status: "Extraction error forwarded"});
         return false;
    } else if (message.action === "updateStatus" || message.action === "downloadFile" || message.action === "displayError") {
        // These messages are intended for the popup; background doesn't need to handle them
        return false;
    }

    // Handle other potential messages if needed
    console.log("Unknown message action received:", message.action);
    // Return false if not handling the message or not intending to send an async response
    return false;
});

/**
 * Fetches MLB Player ID for a given player name using the MLB Stats API.
 * @param {string} playerName - The name of the player.
 * @returns {Promise<string|null>} A promise that resolves with the player ID string or null if not found/error.
 */
async function fetchPlayerId(playerName) {
    const encodedName = encodeURIComponent(playerName);
    const apiUrl = `https://statsapi.mlb.com/api/v1/people/search?names=${encodedName}`;
    // Send status update to popup
    chrome.runtime.sendMessage({ action: "updateStatus", text: `Fetching ID for ${playerName}...` });

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            // Include player name in error for better debugging
            throw new Error(`API request failed for ${playerName} with status ${response.status}`);
        }
        const data = await response.json();
        if (data.people && data.people.length > 0) {
            // Assuming the first result is the correct one
            const playerId = data.people[0].id;
            console.log(`Found ID for ${playerName}: ${playerId}`);
            return String(playerId); // Ensure it's a string
        } else {
            console.warn(`Player ID not found for ${playerName}`);
            return null; // Player not found
        }
    } catch (error) {
        console.error(`Error fetching ID for ${playerName}:`, error);
        // Propagate a more specific error
        throw new Error(`Failed to fetch ID for ${playerName}. ${error.message}`);
    }
}

/**
 * Generates the final Streamfinder config by adding picked players to a base config.
 * @param {Array<Object>} players - Array of {name: string, position: string}.
 * @param {string} baseConfigString - The JSON string of the base configuration.
 * @returns {Promise<Object>} A promise that resolves with the final configuration object.
 */
async function generateConfigFromPlayers(players, baseConfigString) {
    if (!players || players.length === 0) {
        throw new Error("No players provided to generate config.");
    }

    let baseConfig;
    try {
        baseConfig = JSON.parse(baseConfigString);
        // Basic validation of base config structure
        if (!baseConfig || typeof baseConfig !== 'object' || !Array.isArray(baseConfig.priority)) {
             throw new Error("Base config is missing 'priority' array.");
        }
        console.log("Successfully parsed base config.");
    } catch (e) {
        console.error("Failed to parse provided base config string:", e);
        // Re-throw to inform the user of the bad config.
        throw new Error(`Invalid base configuration format: ${e.message}`);
    }

    // Deep copy the parsed base config to avoid modifying the original object implicitly
    let newConfig = JSON.parse(JSON.stringify(baseConfig));
    let newPriorityItems = [];

    // Fetch IDs for all players concurrently
    // Use Promise.allSettled to handle individual fetch failures gracefully
    const idPromises = players.map(player =>
        fetchPlayerId(player.name).catch(err => {
            // Catch errors during fetchPlayerId itself and return an error marker
            console.error(`Caught error fetching ID for ${player.name}: ${err.message}`);
            // Send status update for specific player failure
            chrome.runtime.sendMessage({ action: "updateStatus", text: `Warning: Failed to fetch ID for ${player.name}. Skipping.` });
            return { error: true, name: player.name, message: err.message }; // Mark as error
        })
    );
    const results = await Promise.all(idPromises); // Wait for all fetches/catches

    // Create new priority items for successfully fetched players
    for (let i = 0; i < players.length; i++) {
        const player = players[i];
        const result = results[i]; // Result can be playerId string or {error: true, ...}

        // Check if the result is not an error object and is a valid ID string
        if (result && !result.error && typeof result === 'string') {
            const playerId = result;
            // Determine type based on position (simple check)
            const type = (player.position === 'SP' || player.position === 'RP') ? 'pit' : 'bat';
            newPriorityItems.push({
                type: type,
                data: playerId,
                immediate: "", // Keep immediate empty as per base config style
                priority: 0 // Placeholder, will be renumbered later
            });
        } else if (result === null) {
            // Handle case where fetchPlayerId returned null (not found)
             chrome.runtime.sendMessage({ action: "updateStatus", text: `Warning: Could not find MLB ID for ${player.name}. Skipping.` });
             console.warn(`Skipping ${player.name} due to missing ID.`);
        }
        // Errors during fetch (result.error === true) are already logged/status updated within the map's catch block
    }

     if (newPriorityItems.length === 0) {
        // If NO players were successfully added, this might be an issue.
        throw new Error("Could not find/add any of the selected players. Check player names and API status.");
    }

    // Combine new items with existing ones from the (parsed) base config
    // Ensure priority array exists even if base config was minimal
    newConfig.priority = newConfig.priority || [];
    newConfig.priority = [...newPriorityItems, ...newConfig.priority];

    // Renumber all priorities sequentially starting from 1
    for (let i = 0; i < newConfig.priority.length; i++) {
        newConfig.priority[i].priority = i + 1;
    }

    console.log("Generated final config:", newConfig);
    // Send final status update before resolving
    chrome.runtime.sendMessage({ action: "updateStatus", text: `Generated config with ${newPriorityItems.length} player(s) added.` });
    return newConfig; // Resolve with the final config object
}

// Optional: Log when the background script starts
console.log("Background service worker started.");


