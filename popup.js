// Get references to UI elements
const generateButton = document.getElementById('generateButton');
const statusDiv = document.getElementById('status');
const configFileUploader = document.getElementById('configFile');
const saveConfigButton = document.getElementById('saveConfigButton');
const configStatusDiv = document.getElementById('configStatus');

let selectedFileContent = null; // Store content of the selected file temporarily

// Standardized error logging helper
function logError(context, error) {
    const details = error && error.stack ? error.stack : error;
    console.error(`[Six Picks Error] ${context}`, details);
}

// --- Initialization ---

// Check storage on popup open to see if a custom config exists
document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['customBaseConfig'], (result) => {
        if (chrome.runtime.lastError) {
            setConfigStatus('Error checking storage.', true);
        } else if (result.customBaseConfig) {
            setConfigStatus('Custom base config is saved.', false, true);
        } else {
            setConfigStatus('No custom config saved.');
        }
    });
});


// --- Event Listeners ---

// Listener for file selection
configFileUploader.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) {
        selectedFileContent = null;
        setConfigStatus('No file selected.');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            // Try parsing to validate JSON structure immediately
            JSON.parse(e.target.result);
            selectedFileContent = e.target.result; // Store the raw string content
            setConfigStatus(`File "${file.name}" selected. Ready to save.`);
        } catch (error) {
            selectedFileContent = null;
            setConfigStatus(`Error: File is not valid JSON. ${error.message}`, true);
            configFileUploader.value = ''; // Clear the input
        }
    };
    reader.onerror = () => {
        selectedFileContent = null;
        setConfigStatus(`Error reading file: ${reader.error}`, true);
        configFileUploader.value = ''; // Clear the input
    };
    reader.readAsText(file); // Read the file as text
});

// Listener for the save config button
saveConfigButton.addEventListener('click', () => {
    if (!selectedFileContent) {
        setConfigStatus('Error: No valid file selected to save.', true);
        return;
    }

    // Save the validated JSON string to storage
    chrome.storage.local.set({ customBaseConfig: selectedFileContent }, () => {
        if (chrome.runtime.lastError) {
            setConfigStatus(`Error saving config: ${chrome.runtime.lastError.message}`, true);
        } else {
            setConfigStatus('Custom base config saved successfully!', false, true);
            selectedFileContent = null; // Clear temporary content after saving
            configFileUploader.value = ''; // Clear the file input
        }
    });
});


// Listener for the generate button click
generateButton.addEventListener('click', async () => {
    setStatus('Processing...');
    generateButton.disabled = true;

    try {
        // 1. Check if a custom base config exists in storage
        const { customBaseConfig: baseConfigString } = await storageGet(['customBaseConfig']);
        if (!baseConfigString) {
            throw new Error('Error: No base config saved. Please upload and save one first.');
        }

        // 2. Get the current tab and validate URL
        const tabs = await tabsQuery({ active: true, currentWindow: true });
        const currentTab = tabs[0];
        if (!currentTab) {
            throw new Error('Error: Could not get current tab.');
        }

        // *** UPDATED URL CHECK: Allow view or createEntry pages ***
        const currentUrl = currentTab.url;
        if (!currentUrl || !(currentUrl.includes('ottoneu.fangraphs.com/sixpicks/view/') || currentUrl.includes('ottoneu.fangraphs.com/sixpicks/createEntry'))) {
            throw new Error('Error: Not on an Ottoneu Six Picks view or createEntry page.');
        }

        // 3. Send message to background to set context *before* injecting
        await sendRuntimeMessage({
            action: "setBaseConfigContext",
            baseConfig: baseConfigString,
        });

        setStatus('Base config set. Extracting players...');

        // 4. Inject content script (background script will handle the rest)
        await executeScriptPromise({
            target: { tabId: currentTab.id },
            files: ['content.js'],
        });

        // If injection is successful, content script will send player data to background.
        // Background already has the base config context.
    } catch (error) {
        setError(error.message || error);
        generateButton.disabled = false;
    }
});


// --- Message Handling ---

// Listen for messages from the background script (e.g., final status updates)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Popup received message:", message);

    if (message.action === "updateStatus") {
        setStatus(message.text);
    } else if (message.action === "downloadFile") { // Changed from displayConfig
        try {
            downloadConfig(message.content, message.filename);
            setStatus('Configuration generated. Download started.');
        } catch (e) {
            logError("Download trigger failed", e);
            setError('Error initiating download.');
        }
         generateButton.disabled = false;
    } else if (message.action === "displayError") {
        setError(message.error);
        generateButton.disabled = false;
    }
    // Acknowledge message if needed, especially for async background tasks
    // sendResponse({status: "received"});
     return false; // No async response from popup listener needed here
});

// --- Utility Functions ---

// Promise-based wrappers for Chrome APIs
function storageGet(keys) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(keys, (result) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(result);
            }
        });
    });
}

function tabsQuery(queryInfo) {
    return new Promise((resolve, reject) => {
        chrome.tabs.query(queryInfo, (tabs) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(tabs);
            }
        });
    });
}

function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError || response?.status !== 'ok') {
                reject(new Error(chrome.runtime.lastError?.message || response?.error || 'Unknown error'));
            } else {
                resolve(response);
            }
        });
    });
}

function executeScriptPromise(details) {
    return new Promise((resolve, reject) => {
        chrome.scripting.executeScript(details, (results) => {
            if (chrome.runtime.lastError || !results || results.length === 0) {
                reject(new Error(chrome.runtime.lastError?.message || 'Unknown error'));
            } else {
                resolve(results);
            }
        });
    });
}

/**
 * Triggers a browser download for the given text content.
 * @param {string} textContent - The string content for the file.
 * @param {string} filename - The desired name for the downloaded file.
 */
function downloadConfig(textContent, filename) {
    // Create a Blob (Binary Large Object) from the text content
    // Ensure textContent is a string, as message.content should already be stringified JSON
    if (typeof textContent !== 'string') {
        logError('Invalid content for download', textContent);
        setError('Internal error: Invalid configuration format for download.');
        return; // Prevent download attempt with invalid content
    }
    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });

    // Create a temporary URL for the Blob
    const url = URL.createObjectURL(blob);

    // Create a temporary anchor element
    const a = document.createElement('a');
    a.style.display = 'none'; // Hide the element
    a.href = url;
    a.download = filename; // Set the download filename

    // Append the anchor to the body, click it, and remove it
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Release the object URL
    URL.revokeObjectURL(url);
}


// Function to update the status message
function setStatus(message) {
    statusDiv.textContent = message;
    statusDiv.classList.remove('error', 'success'); // Clear both classes
}

// Function to display an error message
function setError(errorMessage) {
    statusDiv.textContent = errorMessage;
    statusDiv.classList.add('error');
    statusDiv.classList.remove('success');
    logError("Extension Error", errorMessage);
}

// Function to update the config status message
function setConfigStatus(message, isError = false, isSuccess = false) {
     configStatusDiv.textContent = message;
     configStatusDiv.classList.remove('error', 'success'); // Remove both classes first
     if (isError) {
         configStatusDiv.classList.add('error');
     } else if (isSuccess) {
          configStatusDiv.classList.add('success');
     }
}

