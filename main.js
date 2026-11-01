"use strict";
const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require("electron");
const path = require("path");
const { createStore } = require("./storage");
const { createBackup } = require("./backup");

// Pasta fixa dos dados (Mac: ~/Library/Application Support/Eis as Notas, Windows: %APPDATA%\Eis as Notas)
app.setPath("userData", path.join(app.getPath("appData"), "Eis as Notas"));

let win = null;
let store = null;
let backup = null;

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

/* ---------- backup automático ---------- */
async function chooseBackupDir() {
  const r = await dialog.showOpenDialog(win, {
    title: "Escolha a pasta de backup (dentro do iCloud Drive, OneDrive, Google Drive ou Dropbox)",
    buttonLabel: "Usar esta pasta",
    properties: ["openDirectory", "createDirectory"],
  });
  if (r.canceled || !r.filePaths[0]) return backup.status();
  return backup.setDir(r.filePaths[0], store.load());
}
async function backupNow() {
  if (!backup.status().dir) return chooseBackupDir();
  return backup.backupNow(store.load());
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
        { label: "Escolher pasta de backup automático…", click: () => { chooseBackupDir(); } },
        { label: "Fazer backup agora", click: () => { backupNow(); } },
        { label: "Abrir pasta do backup", click: () => { const d = backup.status().dir; if (d) shell.openPath(d); else chooseBackupDir(); } },
        { label: "Desativar backup automático", click: () => { backup.setDir(null); } },
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
  const dir = app.getPath("userData");
  backup = createBackup(dir);
  store = createStore(dir, { onSaved: (data) => backup.schedule(data) });
  backup.onChange((st) => { if (win && !win.isDestroyed()) win.webContents.send("backup:changed", st); });

  ipcMain.on("store:load", (e) => {
    try { e.returnValue = isLocal(e) ? store.load() : null; } catch (err) { e.returnValue = null; }
  });
  ipcMain.handle("store:save", (e, json) => {
    if (!isLocal(e)) throw new Error("origem não permitida");
    return store.save(json).then(() => true);
  });
  ipcMain.handle("backup:status", (e) => (isLocal(e) ? backup.status() : null));
  ipcMain.handle("backup:choose", (e) => (isLocal(e) ? chooseBackupDir() : null));
  ipcMain.handle("backup:now", (e) => (isLocal(e) ? backupNow() : null));
  ipcMain.handle("backup:disable", (e) => (isLocal(e) ? backup.setDir(null) : null));

  buildMenu();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

  // Ao abrir o app, já faz um backup (e confirma que a pasta continua acessível).
  const cur = store.load();
  if (cur && backup.status().dir) backup.backupNow(cur);
});

app.on("window-all-closed", () => app.quit());

// Antes de sair: termina a gravação em andamento e o backup pendente (espera no máximo 8 s).
let quitting = false;
app.on("before-quit", (e) => {
  if (quitting || !store) return;
  e.preventDefault();
  quitting = true;
  const done = Promise.resolve(store.flush()).catch(() => {}).then(() => backup.flush()).catch(() => {});
  Promise.race([done, new Promise((r) => setTimeout(r, 8000))]).finally(() => app.quit());
});
