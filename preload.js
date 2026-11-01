"use strict";
const { contextBridge, ipcRenderer } = require("electron");

// Única ponte entre a página e o computador: ler/gravar os dados e o backup automático.
contextBridge.exposeInMainWorld("eisDesktop", {
  load: () => ipcRenderer.sendSync("store:load"),
  save: (json) => ipcRenderer.invoke("store:save", json),
  platform: process.platform,
  backup: {
    status: () => ipcRenderer.invoke("backup:status"),
    choose: () => ipcRenderer.invoke("backup:choose"),
    now: () => ipcRenderer.invoke("backup:now"),
    disable: () => ipcRenderer.invoke("backup:disable"),
    onChange: (cb) => { ipcRenderer.on("backup:changed", (_e, st) => cb(st)); },
  },
});
