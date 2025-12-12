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



app.get('/play/:contentId', async (req, res) => {
  try {
    const contentId = req.params.contentId;
    const user = { id: '1', name: 'Admin', email: 'admin@example.com' };

    // Generate the model (the big JSON object)
    // Correct signature: render(contentId, language, user)
    const playerModel = await h5pPlayer.render(contentId, 'en', user);

    // We inject the "PostMessage Bridge" script here
    const bridgeScript = `
            <script>
                // Wait for H5P to be ready
                (function() {
                    H5P.externalDispatcher.on('xAPI', function (event) {
                        
                        // Prepare message
                    const payload = JSON.stringify({
                        type: "xAPI",
                        data: event.data.statement
                    });

                    // For React Native WebView (Android + iOS)
                    if (window.ReactNativeWebView) {
                        window.ReactNativeWebView.postMessage(payload);
                    }

                    // For Web (iframe → parent window)
                    if (window.parent && window.parent !== window) {
                        window.parent.postMessage(payload, "*");
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
                <script src="https://code.jquery.com/jquery-1.12.4.min.js"></script>

                
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

// Upload h5p file
app.get('/upload-file-ui', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../upload.html'));
});


app.listen(PORT, () => {
  console.log(`H5P Server running on http://localhost:${PORT}`);
});
