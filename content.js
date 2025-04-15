// --- Content Script (content.js) ---
// This script runs in the context of the Ottoneu Six Picks page.

/**
 * Extracts player names and positions from the Six Picks table.
 * @returns {Array<Object>|null} An array of objects {name: string, position: string}, or null if the table is not found.
 */
function extractPlayerPicks() {
    console.log("Content script executing on:", window.location.href);

    // Find the table containing the picks.
    // Based on the example HTML, it's the first table inside div.wideleft inside div#content
    const table = document.querySelector('#content .wideleft table');
    if (!table || !table.tBodies || table.tBodies.length === 0) {
        console.error('Could not find the player picks table.');
        return null; // Indicate failure
    }

    const players = [];
    const rows = table.tBodies[0].rows;

    // Iterate over table rows, skipping the header and potential footer/edit rows
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        // Check if the row has the expected number of cells and isn't the edit link row
        if (row.cells.length >= 2 && !row.querySelector('td.editLink')) {
            const positionCell = row.cells[0];
            const playerCell = row.cells[1];

            // Find the player link (<a> tag with href containing '/playercard/')
            const playerLink = playerCell.querySelector('a[href*="/playercard/"]');

            if (positionCell && playerLink) {
                const position = positionCell.textContent.trim();
                const name = playerLink.textContent.trim();

                // Basic validation
                if (position && name) {
                    players.push({ name: name, position: position });
                    console.log(`Found player: ${name}, Position: ${position}`);
                } else {
                     console.warn('Skipping row, missing name or position:', row.innerHTML);
                }
            } else {
                 console.warn('Skipping row, could not find position or player link:', row.innerHTML);
            }
        } else {
             console.log('Skipping row (header/footer/edit?):', row.innerHTML);
        }
    }

    if (players.length === 0) {
        console.error('No players extracted from the table.');
        return null;
    }

    return players;
}

// --- Main Execution ---

// Extract players immediately when the script is injected
const extractedPlayers = extractPlayerPicks();

if (extractedPlayers && extractedPlayers.length > 0) {
    // Send the extracted player data to the background script
    console.log('Sending players to background:', extractedPlayers);
    chrome.runtime.sendMessage({
        action: "processPlayers",
        players: extractedPlayers
    }, (response) => {
        // Optional: Handle response from background script if needed
        if (chrome.runtime.lastError) {
            console.error("Error sending message:", chrome.runtime.lastError.message);
        } else {
            console.log("Background script responded:", response);
        }
    });
} else {
    // Send an error message back to the popup via the background script
     console.error("Failed to extract players. Sending error message.");
     chrome.runtime.sendMessage({
         action: "extractionFailed",
         error: "Could not find or parse the player table on the page."
     });
}

// Note: This script sends the data and finishes.
// The background script handles the API calls and config generation.

