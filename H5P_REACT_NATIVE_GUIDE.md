# H5P xAPI Bridge for React Native: Implementation Guide

This guide documents the complete process of building a custom Node.js H5P server and integrating it with a React Native mobile application to track xAPI learning analytics.

## 1. Architecture Overview

We achieved **xAPI tracking** in a mobile app (which runs native code) by using a "Bridge" pattern:
1.  **Backend:** Serves the H5P player and content. Crucially, it injects a small JavaScript snippet into the player's HTML.
2.  **Bridge Script:** Listens for internal H5P xAPI events and forwards them to the hosting WebView using `window.ReactNativeWebView.postMessage`.
3.  **Frontend (React Native):** Uses a `WebView` to display the content and an `onMessage` handler to capture the xAPI data sent by the bridge.

---

## 2. Backend Setup (Node.js)

The backend is responsible for hosting the H5P engine, libraries, and content.

### 2.1. Initialization
We created a folder `h5p-server` and installed the necessary packages:

```bash
mkdir h5p-server && cd h5p-server
npm init -y
npm install express @lumieducation/h5p-server @lumieducation/h5p-express body-parser cors express-fileupload
```

### 2.2. Server Implementation (`index.js`)
We created an `index.js` that sets up the H5P Server.
**Key Customization:** We used `H5PPlayer` with a custom renderer. Instead of returning a string, we intercepted the data model to manually construct the HTML. This allowed us to inject the **Bridge Script**:

```javascript
// The Bridge Script injected into the H5P Player HTML
<script>
    (function() {
        H5P.externalDispatcher.on('xAPI', function (event) {
            // Send to React Native if the environment exists
            if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'xAPI',
                    data: event.data.statement
                }));
            }
        });
    })();
</script>
```

### 2.3. Content & Library Installation
Since we faced issues with the upload stream, we manually installed the content:
1.  **H5P Core Libraries:** Downloaded `h5p-php-library` master and placed it in `h5p-server/h5p-core`.
2.  **Content Extraction:** Unzipped `sample.h5p` and moved:
    *   `h5p.json` -> `h5p-storage/content/1/h5p.json`
    *   `content/content.json` -> `h5p-storage/content/1/content.json`
    *   `content/images` -> `h5p-storage/content/1/images` (Crucial for assets)
    *   Library folders -> `h5p-storage/libraries/`

---

## 3. Frontend Setup (React Native / Expo)

The frontend is a standard Expo app that loads the server URL.

### 3.1. Initialization
```bash
npx create-expo-app my-h5p-app --template blank
cd my-h5p-app
npm install react-native-webview
```

*Note: We removed the nested `.git` folder in `my-h5p-app` to prevent it from becoming a git submodule.*

### 3.2. App Implementation (`App.js`)
We replaced `App.js` with a `WebView` container that connects to the local server.

```javascript
<WebView 
  source={{ uri: 'http://localhost:3000/play/1' }} // Use 10.0.2.2 for Android Emulator
  onMessage={(event) => {
    const data = JSON.parse(event.nativeEvent.data);
    if (data.type === 'xAPI') {
      console.log("User interaction:", data.data);
    }
  }}
/>
```

---

## 4. How to Run the Project

You need two terminal windows running simultaneously.

### Terminal 1: Backend
```bash
cd h5p-server
node index.js
```
*   The server runs on `http://localhost:3000`.
*   **Mock Client:** Visit `http://localhost:3000/mock` in your browser to test without a phone.

### Terminal 2: Frontend
```bash
cd my-h5p-app
npm run start
```
*   Press `a` to run on Android Emulator.
*   Press `i` to run on iOS Simulator.
*   Scan QR code to run on physical device (ensure phone and PC are on the same Wi-Fi and update `H5P_SERVER_URL` in `App.js` to your PC's IP address).

---

## 5. Troubleshooting Tips

*   **Blank Screen:** Usually means H5P Core JS/CSS files are missing. Check `h5p-server/h5p-core`.
*   **Missing Images:** Ensure the `images` folder inside the `.h5p` content zip was correctly moved to `h5p-storage/content/<id>/images`.
*   **Android Network Error:** Android Emulator cannot see `localhost`. Use `10.0.2.2` or your machine's LAN IP (e.g., `192.168.1.x`).
*   **CORS:** We enabled `cors` middleware in Express to allow cross-origin requests if needed.

