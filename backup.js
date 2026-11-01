"use strict";
/* Backup automático para uma pasta escolhida pelo usuário (normalmente dentro do iCloud Drive,
   OneDrive, Google Drive ou Dropbox: o próprio serviço envia os arquivos para a nuvem).
   - Grava ~20 s depois da última alteração (e ao fechar o app).
   - Mantém "Eis as Notas - backup mais recente.json" + uma cópia por dia (30 dias).
   - Se a pasta sumir (nuvem desconectada, disco removido), mostra o problema e tenta de novo sozinho.
   Não depende do Electron, então pode ser testado com Node puro. */
const fs = require("fs");
const path = require("path");

const KEEP_DAYS = 30;
const LATEST = "Eis as Notas - backup mais recente.json";
const DATED = /^Eis as Notas - backup (\d{4}-\d{2}-\d{2})\.json$/;

function stamp(d = new Date()) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function friendly(e) {
  const c = e && e.code;
  if (c === "ENOENT" || c === "ENOTDIR") return "pasta não encontrada (a nuvem está conectada?)";
  if (c === "EACCES" || c === "EPERM") return "sem permissão para gravar na pasta";
  if (c === "ENOSPC") return "sem espaço no disco";
  return "não foi possível gravar (" + ((e && e.message) || "erro") + ")";
}

function createBackup(userDataDir, opts = {}) {
  const delay = opts.delayMs === undefined ? 20000 : opts.delayMs;
  const retryMs = opts.retryMs === undefined ? 5 * 60 * 1000 : opts.retryMs;
  const cfgFile = path.join(userDataDir, "config.json");

  function readCfg() {
    try { return JSON.parse(fs.readFileSync(cfgFile, "utf8")) || {}; } catch (e) { return {}; }
  }
  const c = readCfg();
  const state = { dir: c.backupDir || null, last: c.lastBackup || null, error: null, dirtySince: null };
  let latest = null;
  let timer = null;
  let retryTimer = null;
  let running = Promise.resolve();
  const listeners = new Set();

  function writeCfg() {
    try {
      fs.mkdirSync(userDataDir, { recursive: true });
      fs.writeFileSync(cfgFile, JSON.stringify({ backupDir: state.dir, lastBackup: state.last }), "utf8");
    } catch (e) { /* configuração é um extra */ }
  }
  const status = () => ({ dir: state.dir, last: state.last, error: state.error, dirtySince: state.dirtySince });
  const emit = () => { for (const f of listeners) { try { f(status()); } catch (e) {} } };
  const unref = (t) => { if (t && t.unref) t.unref(); return t; };

  async function writeBackup(dir, data) {
    const st = await fs.promises.stat(dir).catch(() => null);
    if (!st || !st.isDirectory()) { const e = new Error("pasta ausente"); e.code = "ENOENT"; throw e; }
    const put = async (name) => {
      const f = path.join(dir, name);
      await fs.promises.writeFile(f + ".tmp", data, "utf8");
      await fs.promises.rename(f + ".tmp", f);
    };
    await put(LATEST);
    await put("Eis as Notas - backup " + stamp() + ".json");
    const all = (await fs.promises.readdir(dir)).filter((n) => DATED.test(n)).sort();
    for (const old of all.slice(0, Math.max(0, all.length - KEEP_DAYS))) {
      await fs.promises.unlink(path.join(dir, old)).catch(() => {});
    }
  }

  function run() {
    clearTimeout(timer);
    running = running.then(async () => {
      if (!state.dir || latest === null) return status();
      const data = latest;
      clearTimeout(retryTimer);
      try {
        await writeBackup(state.dir, data);
        if (latest === data) { latest = null; state.dirtySince = null; }
        state.last = new Date().toISOString();
        state.error = null;
        writeCfg();
      } catch (e) {
        state.error = friendly(e);
        if (retryMs > 0) retryTimer = unref(setTimeout(() => { run(); }, retryMs));
      }
      emit();
      return status();
    });
    return running;
  }

  /** Chamado a cada gravação dos dados principais. */
  function schedule(json) {
    if (!state.dir) return;
    latest = json;
    if (!state.dirtySince) state.dirtySince = new Date().toISOString();
    emit();
    clearTimeout(timer);
    timer = unref(setTimeout(() => { run(); }, delay));
  }

  /** Faz o backup já (menu "Fazer backup agora", fechamento do app, escolha de pasta). */
  function backupNow(json) {
    if (!state.dir) return Promise.resolve(status());
    if (json) { latest = json; if (!state.dirtySince) state.dirtySince = new Date().toISOString(); }
    return run();
  }

  function setDir(dir, currentJson) {
    clearTimeout(timer);
    clearTimeout(retryTimer);
    state.dir = dir || null;
    state.error = null;
    state.dirtySince = null;
    latest = null;
    writeCfg();
    if (state.dir && currentJson) return backupNow(currentJson);
    emit();
    return Promise.resolve(status());
  }

  return { status, schedule, backupNow, setDir, flush: () => (latest !== null ? run() : running), onChange: (f) => { listeners.add(f); return () => listeners.delete(f); } };
}

module.exports = { createBackup, LATEST, DATED, KEEP_DAYS };
