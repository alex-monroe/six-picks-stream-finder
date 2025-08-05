# Six Picks Stream Finder

This repository contains a Chrome extension that parses Ottoneu Six Picks pages and builds a configuration for Baseball-Reference's [Streamfinder](https://www.baseball-reference.com/leagues/daily.fcgi?request=1&type=b&dates=any&game_type=A&cc=) tool.

It automates the process of finding MLB player IDs and formatting them into the `.txt` file that Streamfinder requires.

## How to Use

### 1. Installation

It is recommended to install this extension from the Chrome Web Store (link to be added).

Alternatively, you can load it as an unpacked extension in developer mode:
1.  Download or clone this repository.
2.  Open Chrome and navigate to `chrome://extensions`.
3.  Enable "Developer mode" in the top right corner.
4.  Click "Load unpacked" and select the directory where you cloned/downloaded this repository.

### 2. Configuration

The Streamfinder tool can use a base configuration file to prioritize players. This extension uses the same concept. Before you can generate a new config, you must provide a base file.

1.  Create a base `streamfinder.txt` file. You can start with an empty one or use one you have previously downloaded from the Streamfinder site. The format is JSON. An empty base file would look like this:
    ```json
    {
      "priority": []
    }
    ```
2.  In the extension popup, click "Choose File" and select your base configuration file.
3.  Click "Save Config". The extension will validate the JSON and save it in its local storage for future use.

### 3. Generate the Configuration

1.  Navigate to your Ottoneu Six Picks page. The URL should look something like `https://ottoneu.fangraphs.com/sixpicks/view/...` or `https://ottoneu.fangraphs.com/sixpicks/createEntry/...`.
2.  Click the extension icon in your toolbar to open the popup.
3.  Click the "Generate" button.
4.  The extension will read the players from the table, fetch their MLB player IDs from the MLB Stats API, and merge them into your base configuration. You will see status updates in the popup as it works.

### 4. Download

Once the process is complete, the extension will automatically trigger a download of the new configuration file, named `streamfinder_config_YYYY-MM-DD.txt`. You can then upload this file directly to the Baseball-Reference Streamfinder tool.

## For Developers

The project uses [Jest](https://jestjs.io/) for unit tests.

1.  Install dependencies:
    ```bash
    npm install
    ```
2.  Run the test suite:
    ```bash
    npm test
    ```

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
