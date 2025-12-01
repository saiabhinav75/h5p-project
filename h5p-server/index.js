const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs'); // Added fs requirement
const {
    H5PEditor,
    H5PConfig,
    H5PPlayer,
    fsImplementations
} = require('@lumieducation/h5p-server');
const { h5pAjaxExpressRouter } = require('@lumieducation/h5p-express');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '500mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '500mb' }));

// 1. Configuration: Paths for local storage
const localH5PPath = path.resolve('h5p-storage');

// Ensure directories exist (in a real app, you'd create them programmatically or manually)
// For this demo, the library handles creation if permissions allow.

const config = new H5PConfig(new fsImplementations.JsonStorage(path.resolve(localH5PPath, 'h5p-settings.json')));
const libraryStorage = new fsImplementations.FileLibraryStorage(path.resolve(localH5PPath, 'libraries'));
const contentStorage = new fsImplementations.FileContentStorage(path.resolve(localH5PPath, 'content'));
const temporaryStorage = new fsImplementations.DirectoryTemporaryFileStorage(path.resolve(localH5PPath, 'temp'));

// 2. Initialize H5P Server components
// We need an Editor (to upload/manage) and a Player (to render)
const h5pEditor = new H5PEditor(
    new fsImplementations.JsonStorage(path.resolve(localH5PPath, 'h5p-config.json')), // Config storage
    config,
    libraryStorage,
    contentStorage,
    temporaryStorage
);

// Initialize H5P Player for rendering content
const h5pPlayer = new H5PPlayer(
    libraryStorage,
    contentStorage,
    config
);

// OVERRIDE RENDERER to return the data model instead of HTML string
h5pPlayer.setRenderer((model) => model);

// 3. Standard H5P Routes (for accessing libraries/files)
// This helper connects the H5P internals to Express routes
const h5pAdapter = h5pAjaxExpressRouter(
    h5pEditor,
    path.resolve('h5p-core'),
    path.resolve('h5p-editor')
);

// Serve static files from the H5P storage (Libraries, Content files, etc.)
app.use('/h5p', h5pAdapter);

// 4. Content Ingestion Endpoint (Simple "Upload" Simulation)
// We will use this to "install" our .h5p file later.
const fileUpload = require('express-fileupload');
app.use(fileUpload({
    useTempFiles: true,
    tempFileDir: path.join(__dirname, 'tmp_uploads')
}));

app.post('/upload', async (req, res) => {
    if (!req.files || !req.files.h5p_file) {
        return res.status(400).send('No file uploaded.');
    }
    
    try {
        console.log('Received file size:', req.files.h5p_file.size);
        
        // The library expects a path or buffer. Let's use the buffer.
        // We need a user object (dummy for now)
        const user = { id: '1', name: 'Admin', canCreate: true, canUpdate: true };
        
        // Read the temp file into a buffer manually to avoid compatibility issues
        const buffer = fs.readFileSync(req.files.h5p_file.tempFilePath);
        console.log('Buffer length:', buffer.length);

        // We process the upload. This unzips the .h5p, installs libraries, and saves content.
        const contentId = await h5pEditor.uploadPackage(
            undefined, // New content
            buffer, 
            user
        );
        
        res.json({ success: true, contentId });
    } catch (error) {
        console.error(error);
        res.status(500).send(error.message);
    }
});

// 5. The "Player" HTML Endpoint
// This is what the mobile app will load.
app.get('/play/:contentId', async (req, res) => {
    try {
        const contentId = req.params.contentId;
        const user = { id: '1', name: 'Admin', email: 'admin@example.com' };
        
        // Generate the model (the big JSON object)
        // Correct signature: render(contentId, language, user)
        const playerModel = await h5pPlayer.render(contentId, 'en', user);
        console.log('Player Model:', JSON.stringify(playerModel, null, 2)); // Debug log
        
        // We inject the "PostMessage Bridge" script here
        const bridgeScript = `
            <script>
                // Wait for H5P to be ready
                (function() {
                    H5P.externalDispatcher.on('xAPI', function (event) {
                        console.log("xAPI Event detected", event.data.statement);
                        
                        // BRIDGE: Send to React Native
                        if (window.ReactNativeWebView) {
                            window.ReactNativeWebView.postMessage(JSON.stringify({
                                type: 'xAPI',
                                data: event.data.statement
                            }));
                        }
                    });
                })();
            </script>
        `;

        // Basic HTML Template
        const html = `
            <!doctype html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>H5P Player</title>
                
                <!-- H5P Core Scripts & Styles -->
                ${(playerModel.styles || []).map(s => `<link rel="stylesheet" href="${s}">`).join('\n')}
                ${(playerModel.scripts || []).map(s => `<script src="${s}"></script>`).join('\n')}
            </head>
            <body>
                <div class="h5p-content" data-content-id="${contentId}"></div>
                
                <script>
                    // H5P Integration Object
                    window.H5PIntegration = ${JSON.stringify(playerModel.integration, null, 2)};
                </script>
                
                ${bridgeScript}
            </body>
            </html>
        `;
        
        res.send(html);
    } catch (error) {
        console.error(error);
        res.status(500).send('Error rendering content: ' + error.message);
    }
});

// Serve Mock Mobile Client
app.get('/mock', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../mock-mobile.html'));
});

app.listen(PORT, () => {
    console.log(`H5P Server running on http://localhost:${PORT}`);
});
