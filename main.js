"use strict";
const { app, BrowserWindow, Menu, shell, ipcMain } = require("electron");
const path = require("path");
const { createStore } = require("./storage");

// Pasta fixa dos dados (Mac: ~/Library/Application Support/Eis as Notas, Windows: %APPDATA%\Eis as Notas)
app.setPath("userData", path.join(app.getPath("appData"), "Eis as Notas"));

let win = null;
let store = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

const isLocal = (e) => {
  try { return (e.senderFrame ? e.senderFrame.url : "").startsWith("file://"); } catch (err) { return false; }
};

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    title: "Eis as Notas",
    backgroundColor: "#0a0a0c",
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.loadFile(path.join(__dirname, "index.html"));

  // A página nunca navega para fora nem abre janelas novas.
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("file://")) e.preventDefault(); });

  // "Salvar backup": abre a janela de salvar, começando em Documentos.
  win.webContents.session.on("will-download", (e, item) => {
    item.setSaveDialogOptions({
      title: "Salvar backup do Eis as Notas",
      defaultPath: path.join(app.getPath("documents"), item.getFilename()),
    });
  });
  win.on("closed", () => { win = null; });
}

function buildMenu() {
  const mac = process.platform === "darwin";
  const clickPage = (id) => () => win && win.webContents.executeJavaScript("document.getElementById('" + id + "').click()");
  const template = [
    ...(mac ? [{ role: "appMenu" }] : []),
    {
      label: "Arquivo",
      submenu: [
        { label: "Salvar backup…", accelerator: "CmdOrCtrl+S", click: clickPage("bk-exp") },
        { label: "Restaurar backup…", click: clickPage("bk-imp") },
        { type: "separator" },
        { label: "Abrir pasta dos dados", click: () => shell.openPath(app.getPath("userData")) },
        { type: "separator" },
        mac ? { role: "close", label: "Fechar janela" } : { role: "quit", label: "Sair" },
      ],
    },
    {
      label: "Editar",
      submenu: [
        { role: "undo", label: "Desfazer" }, { role: "redo", label: "Refazer" }, { type: "separator" },
        { role: "cut", label: "Recortar" }, { role: "copy", label: "Copiar" }, { role: "paste", label: "Colar" },
        { role: "selectAll", label: "Selecionar tudo" },
      ],
    },
    {
      label: "Exibir",
      submenu: [
        { role: "zoomIn", label: "Aumentar" }, { role: "zoomOut", label: "Diminuir" },
        { role: "resetZoom", label: "Tamanho normal" }, { type: "separator" },
        { role: "togglefullscreen", label: "Tela cheia" },
      ],
    },
    { role: "windowMenu", label: "Janela" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  store = createStore(app.getPath("userData"));
  ipcMain.on("store:load", (e) => {
    try { e.returnValue = isLocal(e) ? store.load() : null; } catch (err) { e.returnValue = null; }
  });
  ipcMain.handle("store:save", (e, json) => {
    if (!isLocal(e)) throw new Error("origem não permitida");
    return store.save(json).then(() => true);
  });
  buildMenu();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => app.quit());

// Antes de sair, termina qualquer gravação em andamento.
let quitting = false;
app.on("before-quit", (e) => {
  if (quitting || !store) return;
  e.preventDefault();
  quitting = true;
  Promise.resolve(store.flush()).catch(() => {}).finally(() => app.quit());
});
