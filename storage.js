"use strict";
/* Armazenamento em arquivo JSON, com gravação segura:
   - escreve num arquivo temporário e só então renomeia (nunca deixa o arquivo pela metade);
   - guarda uma cópia .bak da gravação anterior (usada se o arquivo principal estiver corrompido);
   - guarda 1 snapshot por dia na pasta "backups" (mantém os 14 mais recentes).
   Não depende do Electron, então pode ser testado com Node puro. */
const fs = require("fs");
const path = require("path");

function createStore(dir) {
  const file = path.join(dir, "eis-as-notas.json");
  const bak = file + ".bak";
  const tmp = file + ".tmp";
  const snapDir = path.join(dir, "backups");
  let writing = false;
  let pending = null;
  let idle = Promise.resolve();

  function readValid(p) {
    try {
      const t = fs.readFileSync(p, "utf8");
      JSON.parse(t);
      return t;
    } catch (e) {
      return null;
    }
  }

  function load() {
    fs.mkdirSync(dir, { recursive: true });
    const main = readValid(file);
    return main !== null ? main : readValid(bak);
  }

  async function dailySnapshot() {
    try {
      if (!fs.existsSync(file)) return;
      const d = new Date();
      const stamp = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      const snap = path.join(snapDir, "eis-as-notas-" + stamp + ".json");
      if (fs.existsSync(snap)) return;
      await fs.promises.mkdir(snapDir, { recursive: true });
      await fs.promises.copyFile(file, snap);
      const all = (await fs.promises.readdir(snapDir)).filter((n) => /^eis-as-notas-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort();
      for (const old of all.slice(0, Math.max(0, all.length - 14))) {
        await fs.promises.unlink(path.join(snapDir, old)).catch(() => {});
      }
    } catch (e) { /* snapshot é um extra: nunca pode impedir a gravação */ }
  }

  async function writeNow(data) {
    JSON.parse(data); // recusa gravar algo que não seja JSON válido
    await fs.promises.mkdir(dir, { recursive: true });
    await dailySnapshot();
    await fs.promises.writeFile(tmp, data, "utf8");
    if (fs.existsSync(file)) await fs.promises.copyFile(file, bak).catch(() => {});
    await fs.promises.rename(tmp, file);
  }

  function save(json) {
    if (typeof json !== "string" || json.length > 200 * 1024 * 1024) return Promise.reject(new Error("dados inválidos"));
    pending = json;
    if (writing) return idle;
    writing = true;
    idle = (async () => {
      try {
        while (pending !== null) {
          const d = pending;
          pending = null;
          await writeNow(d);
        }
      } finally {
        writing = false;
      }
    })();
    return idle;
  }

  return { load, save, flush: () => idle, file, dir };
}

module.exports = { createStore };
