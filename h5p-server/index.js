import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import multer from "multer";
import { exec } from "child_process";

import {
  H5PEditor,
  H5PConfig,
  H5PPlayer,
  fsImplementations
} from "@lumieducation/h5p-server";
import { h5pAjaxExpressRouter } from "@lumieducation/h5p-express";

const app = express();
const PORT = 3000;

app.use(cors());

 

const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 1024 * 1024 * 1024 } // 1GB max
});

// ----------------------------------------------
// 3. H5P STORAGE CONFIG
// ----------------------------------------------
const localH5PPath = path.resolve("h5p-storage");
const __dirname = path.resolve();
const config = new H5PConfig(
  new fsImplementations.JsonStorage(
    path.resolve(localH5PPath, "h5p-settings.json")
  )
);


const libraryStorage = new fsImplementations.FileLibraryStorage(
  path.resolve(localH5PPath, "libraries")
);

const contentStorage = new fsImplementations.FileContentStorage(
  path.resolve(localH5PPath, "content")
);

const temporaryStorage = new fsImplementations.DirectoryTemporaryFileStorage(
  path.resolve(localH5PPath, "temp")
);

// ----------------------------------------------
// 4. H5P Editor & Player
// ----------------------------------------------
const h5pEditor = new H5PEditor(
  new fsImplementations.JsonStorage(
    path.resolve(localH5PPath, "h5p-config.json")
  ),
  config,
  libraryStorage,
  contentStorage,
  temporaryStorage
);


const h5pPlayer = new H5PPlayer(libraryStorage, contentStorage, config);
h5pPlayer.setRenderer(model => model);

const h5pAdapter = h5pAjaxExpressRouter(
  h5pEditor,
  path.resolve("h5p-storage/h5p-core"),
  path.resolve("h5p-storage/h5p-editor")
);

app.use("/h5p", h5pAdapter);


// ----------------------------------------------
// 5. UNZIP FUNCTION
// ---------------------------------------------- 

function unzipH5P(filePath) {
  return new Promise((resolve, reject) => {
    const outputDir = path.join(
      process.cwd(),
      "extracted",
      path.basename(filePath).replace(".h5p", "")
    );

    fs.mkdirSync(outputDir, { recursive: true });

    const cmd = `unzip "${filePath}" -d "${outputDir}"`;

    exec(cmd, (err) => {
      if (err) return reject(err);
      resolve(outputDir);
    });
  });
}

// ----------------------------------------------
// 6. FINAL UPLOAD ROUTE (WORKING)
// ----------------------------------------------
app.post("/upload", upload.single("h5p_file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("No file uploaded");
    }

    const user = { id: "1", name: "Admin" };

    console.log("Uploaded file:", req.file.path);

    // 1️⃣ Unzip H5P file
    const extractedDir = await unzipH5P(req.file.path);
    console.log("Extracted to:", extractedDir);

    // 2️⃣ READ metadata (h5p.json)
    const metadataPath = path.join(extractedDir, "h5p.json");
    if (!fs.existsSync(metadataPath)) {
      throw new Error("h5p.json not found inside extracted folder");
    }
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));

    // 3️⃣ READ parameters (content/content.json)
    const paramsPath = path.join(extractedDir, "content", "content.json");

    let parameters = {};
    if (fs.existsSync(paramsPath)) {
      parameters = JSON.parse(fs.readFileSync(paramsPath, "utf-8"));
    }

    // 4️⃣ READ ALL library.json files
    const librariesDir = path.join(extractedDir, "libraries");
    let libraries = {};

    if (fs.existsSync(librariesDir)) {
      const libFolders = fs.readdirSync(librariesDir);

      for (const folder of libFolders) {
        const libPath = path.join(librariesDir, folder, "library.json");
        if (fs.existsSync(libPath)) {
          libraries[folder] = JSON.parse(fs.readFileSync(libPath, "utf-8"));
        }
      }
    }

    const mainLibDep = metadata.preloadedDependencies.find(
      dep => dep.machineName === metadata.mainLibrary
    );

    if (!mainLibDep) {
      throw new Error(`Main library "${metadata.mainLibrary}" not found in preloaded dependencies.`);
    }

    const mainLibraryUbername = `${mainLibDep.machineName} ${mainLibDep.majorVersion}.${mainLibDep.minorVersion}`;
    console.log('Main Library Ubername:', mainLibraryUbername);

    const contentId = await h5pEditor.saveOrUpdateContent(
      undefined, // undefined = Create new content
      parameters,
      metadata,
      mainLibraryUbername,
      user
    );

    console.log('Generated Content ID:', contentId);

    // 5️⃣ Return everything to client
    res.json({
      success: true,
      extractedPath: extractedDir,
      metadata,
      parameters,
      libraries
    });

  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
});



// app.get('/play/:contentId', async (req, res) => {
//   try {
//     const contentId = req.params.contentId;
//     const user = { id: '1', name: 'Admin', email: 'admin@example.com' };

//     // Generate the model (the big JSON object)
//     // Correct signature: render(contentId, language, user)
//     const playerModel = await h5pPlayer.render(contentId, 'en', user);

//     // We inject the "PostMessage Bridge" script here
//     const bridgeScript = `
//             <script>
//                 // Wait for H5P to be ready
//                 (function() {
//                     H5P.externalDispatcher.on('xAPI', function (event) {
                        
//                         // Prepare message
//                     const payload = JSON.stringify({
//                         type: "xAPI",
//                         data: event.data.statement
//                     });

//                     // For React Native WebView (Android + iOS)
//                     if (window.ReactNativeWebView) {
//                         window.ReactNativeWebView.postMessage(payload);
//                     }

//                     // For Web (iframe → parent window)
//                     if (window.parent && window.parent !== window) {
//                         window.parent.postMessage(payload, "*");
//                     }
                            
//                     });
//                 })();
//             </script>
//         `;

//     // Basic HTML Template
//     const html = `
//             <!doctype html>
//             <html>
//             <head>
//                 <meta charset="utf-8">
//                 <meta name="viewport" content="width=device-width, initial-scale=1">
//                 <title>H5P Player</title>
//                 <script src="https://code.jquery.com/jquery-1.12.4.min.js"></script>

                
//                 <!-- H5P Core Scripts & Styles -->
//                 ${(playerModel.styles || []).map(s => `<link rel="stylesheet" href="${s}">`).join('\n')}
//                 ${(playerModel.scripts || []).map(s => `<script src="${s}"></script>`).join('\n')}
//             </head>
//             <body>
//                 <div class="h5p-content" data-content-id="${contentId}"></div>
                
//                 <script>
//                     // H5P Integration Object
//                     window.H5PIntegration = ${JSON.stringify(playerModel.integration, null, 2)};
//                 </script>
                
//                 ${bridgeScript}
//             </body>
//             </html>
//         `;

//     res.send(html);
//   } catch (error) {
//     console.error(error);
//     res.status(500).send('Error rendering content: ' + error.message);
//   }
// });


// Serve Mock Mobile Client

app.get('/play/:contentId', async (req, res) => {
  try {
    const contentId = req.params.contentId;
    const user = { id: '1', name: 'Admin', email: 'admin@example.com' };

    const playerModel = await h5pPlayer.render(contentId, 'en', user);

    // Configure integration for user mode
    if (playerModel.integration) {
      playerModel.integration.user = {
        name: user.name,
        mail: user.email,
        id: user.id
      };

      if (playerModel.integration.contents && playerModel.integration.contents[`cid-${contentId}`]) {
        const content = playerModel.integration.contents[`cid-${contentId}`];
        content.disable = 0;
        content.displayOptions = {
          frame: true,
          export: false,
          embed: false,
          copyright: false,
          icon: false,
          copy: false
        };
        delete content.preview;
      }

      playerModel.integration.saveFreq = false;
      playerModel.integration.postUserStatistics = true;
      playerModel.integration.ajax = playerModel.integration.ajax || {};
      playerModel.integration.ajax.setFinished = '/h5p/setFinished';
      playerModel.integration.ajax.contentUserData = '/h5p/contentUserData';
    }

    // ENHANCED tracking script with DOM mutation observer
    const bridgeScript = `
      <script>
        (function() {
          console.log('%c 🚀 H5P Enhanced Event Bridge Starting...', 'color: blue; font-weight: bold; font-size: 14px;');
          
          // Track all interactions
          let interactionCount = 0;
          
          // Function to send messages to frontend
          function sendMessage(type, data) {
            const payload = JSON.stringify({ type, data });
            
            // For React Native WebView
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(payload);
            }
            
            // For Web iframe
            if (window.parent && window.parent !== window) {
              window.parent.postMessage(payload, "*");
            }
            
            console.log('%c 📤 ' + type, 'color: green; font-weight: bold;', data);
          }
          
          // Track video progress
          let lastProgressUpdate = 0;
          let videoElement = null;
          
          function setupVideoTracking() {
            const findVideo = setInterval(() => {
              videoElement = document.querySelector('video');
              if (videoElement) {
                clearInterval(findVideo);
                console.log('%c 🎬 Video element found!', 'color: purple; font-weight: bold;');
                
                videoElement.addEventListener('play', () => {
                  sendMessage('video-play', { 
                    currentTime: videoElement.currentTime,
                    timestamp: Date.now()
                  });
                });
                
                videoElement.addEventListener('pause', () => {
                  sendMessage('video-pause', { 
                    currentTime: videoElement.currentTime,
                    timestamp: Date.now()
                  });
                });
                
                videoElement.addEventListener('ended', () => {
                  sendMessage('video-ended', { 
                    duration: videoElement.duration,
                    timestamp: Date.now()
                  });
                });
                
                videoElement.addEventListener('timeupdate', () => {
                  const currentTime = Math.floor(videoElement.currentTime);
                  if (currentTime % 5 === 0 && currentTime !== lastProgressUpdate) {
                    lastProgressUpdate = currentTime;
                    sendMessage('video-progress', {
                      currentTime: currentTime,
                      duration: videoElement.duration,
                      percentage: (currentTime / videoElement.duration * 100).toFixed(2),
                      timestamp: Date.now()
                    });
                  }
                });
                
                videoElement.addEventListener('seeked', () => {
                  sendMessage('video-seeked', {
                    currentTime: videoElement.currentTime,
                    timestamp: Date.now()
                  });
                });
              }
            }, 100);
            
            setTimeout(() => clearInterval(findVideo), 10000);
          }
          
          // Track DOM clicks to catch interactions
          function setupClickTracking() {
            document.addEventListener('click', (event) => {
              const target = event.target;
              
              // Check if clicked on an interaction element
              if (target.closest('.h5p-interaction') || 
                  target.closest('.h5p-question') ||
                  target.closest('.h5p-summary-interaction') ||
                  target.classList.contains('h5p-joubelui-button')) {
                
                interactionCount++;
                console.log('%c 👆 DOM Click on Interaction!', 'color: orange; font-weight: bold;');
                
                sendMessage('interaction-clicked', {
                  interactionNumber: interactionCount,
                  className: target.className,
                  tagName: target.tagName,
                  timestamp: Date.now()
                });
              }
            }, true); // Use capture phase to catch early
          }
          
          // Watch for overlay/popup appearances (interactions appearing)
          function setupMutationObserver() {
            const observer = new MutationObserver((mutations) => {
              mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                  if (node.nodeType === 1) { // Element node
                    // Check for interaction overlays
                    if (node.classList && (
                        node.classList.contains('h5p-interaction') ||
                        node.classList.contains('h5p-question-popup') ||
                        node.classList.contains('h5p-summary-popup') ||
                        node.classList.contains('h5p-crossroads')
                    )) {
                      console.log('%c 🎯 Interaction Appeared!', 'color: cyan; font-weight: bold;');
                      sendMessage('interaction-appeared', {
                        type: Array.from(node.classList).join(' '),
                        timestamp: Date.now(),
                        videoTime: videoElement ? videoElement.currentTime : null
                      });
                    }
                  }
                });
              });
            });
            
            observer.observe(document.body, {
              childList: true,
              subtree: true
            });
          }
          
          // Initialize H5P listeners
          function initH5PListeners() {
            if (typeof H5P === 'undefined') {
              setTimeout(initH5PListeners, 100);
              return;
            }
            
            console.log('%c ✅ H5P loaded! Registering all listeners...', 'color: green; font-weight: bold; font-size: 14px;');
            
            // Track ALL xAPI events with detailed logging
            H5P.externalDispatcher.on('xAPI', function(event) {
              const statement = event.data.statement;
              const verb = statement.verb.display['en-US'] || statement.verb.id.split('/').pop();
              
              console.log('%c 🎯 xAPI Event: ' + verb, 'color: red; font-weight: bold; font-size: 12px;');
              console.log('   Full statement:', statement);
              
              // Extract useful information
              const eventData = {
                verb: verb,
                verbId: statement.verb.id,
                objectName: statement.object.definition?.name?.['en-US'] || 'Unknown',
                objectType: statement.object.definition?.type,
                result: statement.result,
                timestamp: statement.timestamp,
                context: statement.context,
                fullStatement: statement
              };
              
              // Special handling for different verbs
              if (verb === 'interacted') {
                console.log('%c 👉 USER CLICKED AN INTERACTION!', 'background: yellow; color: black; font-weight: bold; padding: 4px;');
              } else if (verb === 'answered') {
                console.log('%c ✏️ USER ANSWERED A QUESTION!', 'background: green; color: white; font-weight: bold; padding: 4px;');
                console.log('   Response:', statement.result?.response);
              } else if (verb === 'completed') {
                console.log('%c ✅ USER COMPLETED CONTENT!', 'background: blue; color: white; font-weight: bold; padding: 4px;');
              }
              
              sendMessage('xAPI', eventData);
            });
            
            // Track content initialization
            H5P.externalDispatcher.on('initialized', function() {
              console.log('%c 🎬 H5P Content Initialized', 'color: green; font-weight: bold;');
              sendMessage('h5p-initialized', { 
                contentId: '${contentId}',
                timestamp: Date.now()
              });
              
              setupVideoTracking();
              setupClickTracking();
              setupMutationObserver();
            });
            
            // Track all other H5P events
            const eventsToTrack = ['interacted', 'completed', 'answered', 'progressed', 'attempted'];
            
            eventsToTrack.forEach(eventName => {
              H5P.externalDispatcher.on(eventName, function(event) {
                console.log('%c 📢 H5P Event: ' + eventName, 'color: purple;', event);
                sendMessage('h5p-' + eventName, {
                  eventType: eventName,
                  data: event.data,
                  timestamp: Date.now()
                });
              });
            });
            
            console.log('%c 🎉 All listeners registered successfully!', 'color: green; font-weight: bold; font-size: 14px;');
          }
          
          // Start everything
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initH5PListeners);
          } else {
            initH5PListeners();
          }
        })();
      </script>
    `;

    const html = `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>H5P Player</title>
        
        ${(playerModel.styles || []).map(s => `<link rel="stylesheet" href="${s}">`).join('\n')}
        
        <script src="https://code.jquery.com/jquery-1.12.4.min.js"></script>
        
        ${(playerModel.scripts || []).map(s => `<script src="${s}"></script>`).join('\n')}
        
        <style>
          body { 
            margin: 0; 
            padding: 0; 
            background: #000;
          }
          .h5p-content { 
            width: 100%; 
            height: 100vh;
          }
        </style>
      </head>
      <body>
        <div class="h5p-content" data-content-id="${contentId}"></div>
        
        <script>
          window.H5PIntegration = ${JSON.stringify(playerModel.integration, null, 2)};
        </script>
        
        ${bridgeScript}
      </body>
      </html>
    `;

    res.send(html);
  } catch (error) {
    console.error('Error rendering H5P content:', error);
    res.status(500).send('Error rendering content: ' + error.message);
  }
});

app.get('/mock', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../mock-mobile.html'));
});

// Upload h5p file
app.get('/upload-file-ui', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../upload.html'));
});


app.listen(PORT, () => {
  console.log(`H5P Server running on http://localhost:${PORT}`);
});
