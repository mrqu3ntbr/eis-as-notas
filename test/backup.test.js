"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createBackup, LATEST, DATED, KEEP_DAYS } = require("../backup");
const { createStore } = require("../storage");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "eis-bk-"));

(async () => {
  // 1) grava LATEST + cópia do dia, idênticos
  {
    const ud = tmp(), cloud = tmp();
    const b = createBackup(ud, { delayMs: 30, retryMs: 0 });
    await b.setDir(cloud);
    b.schedule('{"v":1}');
    assert.ok(b.status().dirtySince, "deveria estar pendente");
    await sleep(150); await b.flush();
    const files = fs.readdirSync(cloud);
    assert.ok(files.includes(LATEST));
    const dated = files.filter((n) => DATED.test(n));
    assert.strictEqual(dated.length, 1);
    assert.strictEqual(fs.readFileSync(path.join(cloud, LATEST), "utf8"), '{"v":1}');
    assert.strictEqual(fs.readFileSync(path.join(cloud, dated[0]), "utf8"), '{"v":1}');
    assert.strictEqual(b.status().dirtySince, null);
    assert.ok(b.status().last && !b.status().error);
    assert.ok(!files.some((n) => n.endsWith(".tmp")));
  }
  // 2) poda para 30 cópias datadas
  {
    const ud = tmp(), cloud = tmp();
    for (let i = 1; i <= 40; i++) {
      const d = "2020-01-" + String(i).padStart(2, "0");
      fs.writeFileSync(path.join(cloud, `Eis as Notas - backup ${d}.json`), "x");
    }
    fs.writeFileSync(path.join(cloud, "outro.txt"), "não mexer");
    const b = createBackup(ud, { delayMs: 10, retryMs: 0 });
    await b.setDir(cloud, '{"v":2}');
    const dated = fs.readdirSync(cloud).filter((n) => DATED.test(n));
    assert.strictEqual(dated.length, KEEP_DAYS);
    assert.ok(fs.existsSync(path.join(cloud, "outro.txt")));
    assert.ok(!dated.includes("Eis as Notas - backup 2020-01-01.json"));
  }
  // 3) pasta ausente -> erro, mantém pendente, recupera sozinho
  {
    const ud = tmp(), base = tmp(), cloud = path.join(base, "nuvem");
    const b = createBackup(ud, { delayMs: 10, retryMs: 60 });
    await b.setDir(cloud);
    b.schedule('{"v":3}');
    await sleep(150);
    assert.ok(b.status().error, "deveria haver erro");
    assert.ok(b.status().dirtySince, "continua pendente");
    fs.mkdirSync(cloud);
    await sleep(300); await b.flush();
    assert.strictEqual(b.status().error, null);
    assert.strictEqual(b.status().dirtySince, null);
    assert.strictEqual(fs.readFileSync(path.join(cloud, LATEST), "utf8"), '{"v":3}');
  }
  // 4) configuração persiste entre instâncias
  {
    const ud = tmp(), cloud = tmp();
    const a = createBackup(ud, { delayMs: 10, retryMs: 0 });
    await a.setDir(cloud, '{"v":4}');
    const b = createBackup(ud, { delayMs: 10, retryMs: 0 });
    assert.strictEqual(b.status().dir, cloud);
    assert.ok(b.status().last);
    await b.setDir(null);
    assert.strictEqual(createBackup(ud).status().dir, null);
  }
  // 5) sem pasta: schedule não faz nada
  {
    const ud = tmp();
    const b = createBackup(ud, { delayMs: 10, retryMs: 0 });
    b.schedule("{}");
    assert.strictEqual(b.status().dirtySince, null);
  }
  // 6) integração com o store
  {
    const ud = tmp(), cloud = tmp();
    const b = createBackup(ud, { delayMs: 20, retryMs: 0 });
    const s = createStore(ud, { onSaved: (d) => b.schedule(d) });
    await b.setDir(cloud);
    await s.save('{"notas":[1,2,3]}'); await s.flush();
    await sleep(120); await b.flush();
    assert.strictEqual(fs.readFileSync(path.join(cloud, LATEST), "utf8"), '{"notas":[1,2,3]}');
  }
  console.log("backup.test.js: todos os testes passaram");
})().catch((e) => { console.error(e); process.exit(1); });
