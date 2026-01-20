const { app, BrowserWindow } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");

let serverProcess;

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true
    }
  });

  win.loadURL("http://localhost:4000");
};

const startServer = () => {
  const serverPath = path.join(__dirname, "..", "server", "dist", "index.js");
  serverProcess = spawn(process.execPath, [serverPath], {
    stdio: "inherit"
  });
};

const waitForServer = (url, retries = 40) =>
  new Promise((resolve, reject) => {
    const attempt = () => {
      http
        .get(url, (res) => {
          res.resume();
          resolve();
        })
        .on("error", () => {
          if (retries <= 0) {
            reject(new Error("Server not ready"));
            return;
          }
          retries -= 1;
          setTimeout(attempt, 250);
        });
    };
    attempt();
  });

app.whenReady().then(() => {
  startServer();
  waitForServer("http://localhost:4000")
    .then(() => createWindow())
    .catch(() => createWindow());
});

app.on("window-all-closed", () => {
  if (serverProcess) {
    serverProcess.kill();
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});
