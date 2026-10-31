"use strict";
// Teste do armazenamento (não precisa do Electron):  npm test
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { createStore } = require("../storage");

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eis-"));
  const store = createStore(dir);

  assert.strictEqual(store.load(), null, "sem arquivo: deve devolver null");

  // várias gravações em sequência: a última sempre vence e o arquivo fica válido
  const ps = [];
  for (let i = 1; i <= 40; i++) ps.push(store.save(JSON.stringify({ v: i, pad: "x".repeat(200000) })));
  await Promise.all(ps);
  await store.flush();
  assert.strictEqual(JSON.parse(store.load()).v, 40, "a última gravação deve prevalecer");

  // recusa dados inválidos sem estragar o que já existe
  await assert.rejects(store.save("{isto não é json"));
  await assert.rejects(store.save(123));
  assert.strictEqual(JSON.parse(store.load()).v, 40, "dado válido continua intacto");

  // arquivo principal corrompido: recupera da cópia .bak (= gravação imediatamente anterior)
  await store.save(JSON.stringify({ v: 41 }));
  await store.save(JSON.stringify({ v: 42 }));
  fs.writeFileSync(store.file, "{corrompido");
  assert.strictEqual(JSON.parse(store.load()).v, 41, "deve recuperar a gravação anterior da cópia .bak");

  // snapshot diário
  const snaps = fs.readdirSync(path.join(dir, "backups"));
  assert.strictEqual(snaps.length, 1, "um snapshot por dia");
  assert.ok(/^eis-as-notas-\d{4}-\d{2}-\d{2}\.json$/.test(snaps[0]));

  // não sobra arquivo temporário
  assert.ok(!fs.existsSync(store.file + ".tmp"), "não deve sobrar .tmp");

  fs.rmSync(dir, { recursive: true, force: true });
  console.log("storage: todos os testes passaram");
})().catch((e) => { console.error("FALHOU:", e.message); process.exit(1); });
