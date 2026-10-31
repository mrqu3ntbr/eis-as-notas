"use strict";
const { contextBridge, ipcRenderer } = require("electron");

// Única ponte entre a página e o computador: ler e gravar o arquivo de dados.
contextBridge.exposeInMainWorld("eisDesktop", {
  load: () => ipcRenderer.sendSync("store:load"),
  save: (json) => ipcRenderer.invoke("store:save", json),
  platform: process.platform,
});
