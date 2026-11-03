"use strict";
/* Testes da importação de backups: roda o MESMO código do index.html (validador, migração e prepareImport)
   dentro de um contexto isolado do Node, sem navegador. Uso: node test/import.test.js [caminho/do/index.html] */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const htmlPath = process.argv[2] || path.join(__dirname, "..", "index.html");
const html = fs.readFileSync(htmlPath, "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const core = scripts.find(s => s.includes("/*CORE-END*/"));
assert.ok(core, "bloco /*CORE-END*/ não encontrado no HTML");

let saves = 0;
const ctx = vm.createContext({
  window: {}, console,
  localStorage: { getItem: () => null, setItem: () => { saves++; }, removeItem() {} },
});
vm.runInContext(core.slice(0, core.indexOf("/*CORE-END*/")), ctx);
const run = (code, vars) => { Object.assign(ctx, vars || {}); return vm.runInContext(code, ctx); };
const prep = text => run("prepareImport(__t)", { __t: text });
const prepObj = o => prep(JSON.stringify(o));
const plain = o => JSON.parse(JSON.stringify(o));   // objetos do contexto isolado -> objetos comuns (para deepStrictEqual)
const fx = n => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", n), "utf8"));

let passed = 0;
const ok = (name, fn) => { try { fn(); passed++; } catch (e) { console.error("FALHOU: " + name + "\n  " + (e.message || e)); process.exitCode = 1; } };
const refused = (name, obj, expectFragment) => ok("recusa: " + name, () => {
  const r = typeof obj === "string" ? prep(obj) : prepObj(obj);
  assert.strictEqual(r.ok, false, "deveria ter sido recusado");
  assert.ok(r.errors && r.errors.length, "sem mensagem de erro");
  if (expectFragment) assert.ok(r.errors.join(" | ").includes(expectFragment), "mensagem inesperada: " + r.errors.join(" | "));
});

// ---------- imagens de teste ----------
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const WEBP = "data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";
const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

// ======================= backups legítimos =======================
for (const n of ["backup-v1.json", "backup-v2.json", "backup-v3.json", "backup-v4-inicial.json", "backup-v4-completo.json"]) {
  ok("aceita " + n, () => {
    const r = prepObj(fx(n));
    assert.strictEqual(r.ok, true, JSON.stringify(r.errors));
    assert.strictEqual(r.next.version, 4);
    assert.ok(r.next.seasons["2026"] && r.next.seasons["2027"], "duas temporadas");
    assert.ok(r.next.evaluators.length >= 3);
    assert.ok(r.next.drivers.length >= fx(n).drivers.length, "nenhum piloto pode sumir (a migração só acrescenta o Tsunoda)");
    const rated = Object.keys(r.next.ratings).length;
    assert.ok(rated > 0, "as notas devem sobreviver à migração");
  });
}
ok("backups gerados pelo próprio app não geram avisos (nada foi descartado)", () => {
  for (const n of ["backup-v3.json", "backup-v4-inicial.json", "backup-v4-completo.json"]) {
    const r = prepObj(fx(n)); assert.strictEqual(r.ok, true);
    assert.strictEqual(r.warnings.length, 0, n + ": " + JSON.stringify(r.warnings));
  }
});
ok("v1 sem campo version (versões mais antigas) continua funcionando", () => {
  const o = fx("backup-v1.json"); delete o.version;
  assert.strictEqual(prepObj(o).ok, true);
});
ok("v4 completo: notas, imagens, status e trocas de equipe são preservados", () => {
  const src = fx("backup-v4-completo.json"), r = prepObj(src);
  assert.strictEqual(r.ok, true, JSON.stringify(r.errors));
  const a = src.seasons["2026"].ratings.r3, b = r.next.seasons["2026"].ratings.r3;
  assert.deepStrictEqual(plain(b.drivers), a.drivers);
  assert.deepStrictEqual(plain(b.status), a.status);
  assert.deepStrictEqual(plain(b.teamOv), a.teamOv);
  assert.strictEqual(r.next.teams[0].logo, src.teams[0].logo);
  assert.strictEqual(r.next.drivers[1].card, src.drivers[1].card);
  assert.deepStrictEqual(plain(r.next.evaluators), src.evaluators);
});
ok("notas aceitas: inteiros, decimais, limites -10/10 e null", () => {
  const o = fx("backup-v4-completo.json");
  const rt = o.seasons["2026"].ratings.r3; const id = o.drivers[0].id;
  rt.drivers[id] = [-10, 10, 0.55, null];
  rt.race = [7, -0.5, 3, 4.25];
  const r = prepObj(o); assert.strictEqual(r.ok, true, JSON.stringify(r.errors));
  assert.deepStrictEqual(plain(r.next.seasons["2026"].ratings.r3.drivers[id]), [-10, 10, 0.55, null]);
});
ok("arrays com 3 notas (versões antigas) viram 4 com null", () => {
  const r = prepObj(fx("backup-v3.json")); const any = Object.values(r.next.ratings)[0];
  assert.strictEqual(any.race.length, 4); assert.strictEqual(any.race[3], null);
});
ok("textos com HTML são aceitos como texto (e escapados na tela), sem alterar o conteúdo", () => {
  const o = fx("backup-v4-completo.json"); o.drivers[0].name = "Max <b>Verstappen</b> & Cia";
  const r = prepObj(o); assert.strictEqual(r.ok, true); assert.strictEqual(r.next.drivers[0].name, "Max <b>Verstappen</b> & Cia");
});
ok("imagens PNG, WebP e JPEG válidas são aceitas", () => {
  const o = fx("backup-v4-completo.json"); o.teams[2].logo = PNG; o.teams[3].car = WEBP; o.drivers[3].photo = JPEG;
  assert.strictEqual(prepObj(o).ok, true);
});

// ======================= estrutura malformada =======================
refused("não é JSON", "isto não é json");
refused("JSON vazio", "");
refused("lista em vez de objeto", "[1,2,3]");
refused("null", "null");
refused("número", "42");
refused("sem equipes", (() => { const o = fx("backup-v4-completo.json"); delete o.teams; return o; })(), "teams");
refused("sem pilotos", (() => { const o = fx("backup-v4-completo.json"); o.drivers = []; return o; })(), "drivers");
refused("equipes não é lista", (() => { const o = fx("backup-v4-completo.json"); o.teams = {a: 1}; return o; })());
refused("versão futura", Object.assign(fx("backup-v4-completo.json"), { version: 99 }), "version");
refused("versão com texto", Object.assign(fx("backup-v4-completo.json"), { version: "4" }), "version");
refused("temporada inválida", Object.assign(fx("backup-v4-completo.json"), { season: 1999 }), "season");
refused("ano não suportado em seasons", (() => { const o = fx("backup-v4-completo.json"); o.seasons["1999"] = o.seasons["2026"]; return o; })());
refused("avaliadores com tamanho errado", Object.assign(fx("backup-v4-completo.json"), { evaluators: ["a"] }), "evaluators");
refused("avaliador com nome gigante", Object.assign(fx("backup-v4-completo.json"), { evaluators: ["a", "b", "c", "x".repeat(500)] }));
refused("avaliador não-texto", Object.assign(fx("backup-v4-completo.json"), { evaluators: ["a", 2, "c"] }));
refused("ids de piloto repetidos", (() => { const o = fx("backup-v4-completo.json"); o.drivers[1].id = o.drivers[0].id; return o; })(), "repetido");
refused("ids de equipe repetidos", (() => { const o = fx("backup-v4-completo.json"); o.teams[1].id = o.teams[0].id; return o; })(), "repetido");
refused("ids de corrida repetidos", (() => { const o = fx("backup-v4-completo.json"); const r = o.seasons["2026"].races; r[1].id = r[0].id; return o; })(), "repetido");
refused("piloto aponta para equipe inexistente", (() => { const o = fx("backup-v4-completo.json"); o.drivers[0].team = "naoexiste"; return o; })(), "equipe inexistente");
refused("nome vazio", (() => { const o = fx("backup-v4-completo.json"); o.teams[0].name = ""; return o; })());
refused("nome gigante", (() => { const o = fx("backup-v4-completo.json"); o.drivers[0].name = "A".repeat(10000); return o; })());
refused("nome com caractere de controle", (() => { const o = fx("backup-v4-completo.json"); o.drivers[0].name = "Max\u0000Verstappen"; return o; })());
refused("nome não é texto", (() => { const o = fx("backup-v4-completo.json"); o.drivers[0].name = {a: 1}; return o; })());
refused("piloto não é objeto", (() => { const o = fx("backup-v4-completo.json"); o.drivers[0] = "x"; return o; })());
refused("muitos pilotos", (() => { const o = fx("backup-v4-completo.json"); const d = o.drivers[0]; o.drivers = Array.from({length: 500}, (_, i) => Object.assign({}, d, {id: "x" + i})); return o; })(), "drivers");
refused("muitas corridas", (() => { const o = fx("backup-v4-completo.json"); const r = o.seasons["2026"].races[0]; o.seasons["2026"].races = Array.from({length: 500}, (_, i) => Object.assign({}, r, {id: "z" + i})); return o; })());
refused("corridas não é lista", (() => { const o = fx("backup-v4-completo.json"); o.seasons["2026"].races = "x"; return o; })());
refused("ratings não é objeto", (() => { const o = fx("backup-v4-completo.json"); o.seasons["2026"].ratings = [1, 2]; return o; })());
refused("notas de um piloto não é lista", (() => { const o = fx("backup-v4-completo.json"); o.seasons["2026"].ratings.r3.drivers[o.drivers[0].id] = "9"; return o; })());
refused("notas com mais de 4 avaliadores", (() => { const o = fx("backup-v4-completo.json"); o.seasons["2026"].ratings.r3.race = [1, 2, 3, 4, 5]; return o; })());
refused("status inválido", (() => { const o = fx("backup-v4-completo.json"); o.seasons["2026"].ratings.r3.apiStatus = {[o.drivers[0].id]: "<script>"}; return o; })());
refused("equipe inexistente em teamOv", (() => { const o = fx("backup-v4-completo.json"); o.seasons["2026"].ratings.r3.teamOv = {[o.drivers[0].id]: "zzz"}; return o; })());
refused("fonte inválida", (() => { const o = fx("backup-v4-completo.json"); o.seasons["2026"].ratings.r3.src = "evil"; return o; })());
refused("teamStand malformado", Object.assign(fx("backup-v4-completo.json"), { teamStand: { year: "x" } }), "teamStand");

// ======================= notas fora do intervalo / tipos errados =======================
for (const [nome, v] of [["acima de 10", 10.01], ["abaixo de -10", -10.5], ["texto", "9"], ["texto com vírgula", "8,5"], ["booleano", true], ["objeto", {a: 1}], ["lista", [1]], ["muito grande", 1e9]]) {
  refused("nota " + nome, (() => { const o = fx("backup-v4-completo.json"); o.seasons["2026"].ratings.r3.drivers[o.drivers[0].id] = [v, 1, 2, 3]; return o; })(), "nota");
}
refused("nota NaN/Infinity (texto cru)", fs.readFileSync(path.join(__dirname, "fixtures", "backup-v4-completo.json"), "utf8").replace(/"race": \[\s*8,/, '"race": [ NaN,'));
refused("nota 1e999 vira Infinity", fs.readFileSync(path.join(__dirname, "fixtures", "backup-v4-completo.json"), "utf8").replace(/"race": \[\s*8,/, '"race": [ 1e999,'));

// ======================= cores =======================
for (const c of ["red", "#fff", "#12345", "#12345g", "#1234567", "rgb(1,2,3)", "#ff0000;background:url(//evil)", "#ff0000\" onmouseover=\"alert(1)", "url(javascript:alert(1))", "expression(alert(1))", "", null, 123, "#ff00zz", " #ff0000"]) {
  refused("cor " + JSON.stringify(c), (() => { const o = fx("backup-v4-completo.json"); o.teams[0].color = c; return o; })(), "cor");
}
ok("cores válidas (maiúsculas e minúsculas)", () => {
  const o = fx("backup-v4-completo.json"); o.teams[0].color = "#AbCdEf"; assert.strictEqual(prepObj(o).ok, true);
});

// ======================= datas =======================
for (const d of ["2026-02-30", "2026-13-01", "2026-00-10", "26-03-08", "08/03/2026", "2026-3-8", "2026-03-08T00:00:00Z", "2026-03-08<script>", "hoje", 20260308, "1800-01-01", "2500-01-01"]) {
  refused("data " + JSON.stringify(d), (() => { const o = fx("backup-v4-completo.json"); o.seasons["2026"].races[0].date = d; return o; })(), "data");
}
ok("datas válidas e data vazia", () => {
  const o = fx("backup-v4-completo.json"); o.seasons["2026"].races[0].date = "2028-02-29"; o.seasons["2026"].races[1].date = ""; assert.strictEqual(prepObj(o).ok, true);
});
refused("data inexistente em ano não bissexto", (() => { const o = fx("backup-v4-completo.json"); o.seasons["2026"].races[0].date = "2026-02-29"; return o; })());

// ======================= injeção em imagens =======================
const evilImgs = {
  "javascript:": "javascript:alert(1)",
  "URL externa http": "http://evil.example/x.png",
  "URL externa https": "https://evil.example/x.png",
  "URL protocolo relativo": "//evil.example/x.png",
  "SVG base64": "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>').toString("base64"),
  "SVG texto": "data:image/svg+xml,<svg onload=alert(1)>",
  "HTML base64": "data:text/html;base64," + Buffer.from("<script>alert(1)</script>").toString("base64"),
  "GIF": "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
  "aspas fechando o atributo": PNG + '" onerror="alert(1)',
  "fecha o atributo e tag": PNG.slice(0, 60) + '"><script>alert(1)</script>',
  "PNG com bytes errados": "data:image/png;base64," + Buffer.from("isto nao e um png de verdade, so texto").toString("base64"),
  "WebP declarado, conteúdo PNG": "data:image/webp;base64," + PNG.split(",")[1],
  "JPEG declarado, conteúdo WebP": "data:image/jpeg;base64," + WEBP.split(",")[1],
  "sem base64": "data:image/png,iVBORw0KGgo",
  "base64 inválido (tamanho)": "data:image/png;base64," + PNG.split(",")[1].slice(0, -1),
  "espaço/quebra de linha": PNG.slice(0, 40) + "\n" + PNG.slice(40),
  "enorme": "data:image/png;base64," + PNG.split(",")[1].slice(0, 20) + "A".repeat(3000000),
  "não é texto": 12345,
  "objeto": { src: PNG },
  "lista": [PNG],
};
for (const [nome, v] of Object.entries(evilImgs)) {
  for (const campo of ["teams.logo", "teams.car", "drivers.photo", "drivers.card"]) {
    refused("imagem (" + campo + ") " + nome, (() => { const o = fx("backup-v4-completo.json"); const [k, f] = campo.split("."); o[k][0][f] = v; return o; })());
  }
}

// ======================= injeção em IDs, chaves e referências =======================
const evilIds = ['x" onmouseover="alert(1)', "<img src=x onerror=alert(1)>", "d1'><script>alert(1)</script>", "a b", "a\nb", "", "..", "../x", "__proto__", "constructor", "prototype", "toString", "hasOwnProperty", "a".repeat(100), "é", "-x", "_x", 'a"b', "a`b", "${alert(1)}", 7, null, {a: 1}];
for (const id of evilIds) {
  refused("id de piloto " + JSON.stringify(id), (() => { const o = fx("backup-v4-completo.json"); o.drivers[0].id = id; return o; })());
  refused("id de equipe " + JSON.stringify(id), (() => { const o = fx("backup-v4-completo.json"); o.teams[0].id = id; return o; })());
  refused("id de corrida " + JSON.stringify(id), (() => { const o = fx("backup-v4-completo.json"); o.seasons["2026"].races[0].id = id; return o; })());
}
refused("chave maliciosa em ratings", (() => { const o = fx("backup-v4-completo.json"); o.seasons["2026"].ratings['"><script>alert(1)</script>'] = {drivers: {}, teams: {}, race: [null, null, null, null], order: []}; return o; })());
refused("chave maliciosa nas notas dos pilotos", (() => { const o = fx("backup-v4-completo.json"); o.seasons["2026"].ratings.r3.drivers['x" onfocus="alert(1)'] = [1, 2, 3, 4]; return o; })());
refused("__proto__ como chave em notas (texto cru)", fs.readFileSync(path.join(__dirname, "fixtures", "backup-v4-completo.json"), "utf8").replace('"drivers": {', '"drivers": { "__proto__": [1,2,3,4],'));
refused("track malicioso", (() => { const o = fx("backup-v4-completo.json"); o.seasons["2026"].races[0].track = '"><img src=x onerror=alert(1)>'; return o; })(), "pista");
refused("track = constructor", (() => { const o = fx("backup-v4-completo.json"); o.seasons["2026"].races[0].track = "constructor"; return o; })(), "pista");
refused("track não é texto", (() => { const o = fx("backup-v4-completo.json"); o.seasons["2026"].races[0].track = {a: 1}; return o; })());
ok("referências a ids inexistentes em notas/ordem são descartadas (com aviso), sem recusar o backup", () => {
  const o = fx("backup-v4-completo.json"); const rt = o.seasons["2026"].ratings.r3;
  rt.drivers["fantasma"] = [1, 2, 3, 4]; rt.order.push("fantasma"); o.seasons["2026"].ratings.r999 = {drivers: {}, teams: {}, race: [null, null, null, null], order: []};
  const r = prepObj(o); assert.strictEqual(r.ok, true, JSON.stringify(r.errors));
  assert.ok(r.warnings.length >= 2);
  assert.ok(!("fantasma" in r.next.seasons["2026"].ratings.r3.drivers)); assert.ok(!r.next.seasons["2026"].ratings.r3.order.includes("fantasma"));
  assert.ok(!("r999" in r.next.seasons["2026"].ratings));
});
ok("campos desconhecidos (incluindo scripts) nunca entram no estado", () => {
  const o = fx("backup-v4-completo.json"); o.evil = "<script>alert(1)</script>"; o.drivers[0].onclick = "alert(1)"; o.teams[0].style = "x"; o.seasons["2026"].races[0].html = "<b>";
  const r = prepObj(o); assert.strictEqual(r.ok, true);
  const txt = JSON.stringify(r.next); assert.ok(!txt.includes("alert(1)")); assert.ok(!("evil" in r.next)); assert.ok(!("onclick" in r.next.drivers[0]));
});
ok("Object.prototype continua intacto após as tentativas de poluição", () => {
  prep('{"__proto__":{"polluted":1},"teams":[],"drivers":[]}');
  prep(fs.readFileSync(path.join(__dirname, "fixtures", "backup-v4-completo.json"), "utf8").replace('"drivers": {', '"drivers": { "__proto__": {"polluted":1},'));
  assert.strictEqual(run("({}).polluted"), undefined);
});

// ======================= importação recusada não altera nada =======================
ok("importação recusada não altera o estado nem grava nada", () => {
  run("S=defaults(); S.ratings['r1']={drivers:{d1:[9,8,7,6]},teams:{},race:[1,2,3,4],order:['d1']}; S.drivers[0].name='Nome Original';");
  const antes = run("JSON.stringify(exportData())");
  const savesAntes = saves;
  const ruins = ["lixo", "[]", JSON.stringify(Object.assign(fx("backup-v4-completo.json"), {teams: []})), JSON.stringify((() => { const o = fx("backup-v4-completo.json"); o.teams[0].color = "red"; return o; })()), JSON.stringify((() => { const o = fx("backup-v4-completo.json"); o.drivers[0].photo = "javascript:alert(1)"; return o; })())];
  for (const t of ruins) assert.strictEqual(prep(t).ok, false);
  assert.strictEqual(run("JSON.stringify(exportData())"), antes, "o estado mudou!");
  assert.strictEqual(run("S.drivers[0].name"), "Nome Original");
  assert.strictEqual(saves, savesAntes, "algo foi gravado!");
});
ok("importação aceita também não grava nem altera o estado por si só (aplicar é um passo à parte)", () => {
  const antes = run("JSON.stringify(exportData())"), savesAntes = saves;
  assert.strictEqual(prepObj(fx("backup-v4-completo.json")).ok, true);
  assert.strictEqual(run("JSON.stringify(exportData())"), antes); assert.strictEqual(saves, savesAntes);
});
ok("arquivo grande demais é recusado", () => {
  const r = prep(" ".repeat(51 * 1024 * 1024)); assert.strictEqual(r.ok, false);
});
ok("BOM no início do arquivo é tolerado", () => {
  assert.strictEqual(prep("﻿" + JSON.stringify(fx("backup-v4-completo.json"))).ok, true);
});
ok("funções seguras de renderização", () => {
  assert.strictEqual(run("safeColor('#abcdef')"), "#abcdef");
  assert.strictEqual(run("safeColor('red')"), "#444444");
  assert.strictEqual(run("safeColor('#fff;x',null)"), null);
  assert.strictEqual(run("safeImg('javascript:alert(1)')"), null);
  assert.strictEqual(run("safeImg(__p)", {__p: PNG}), PNG);
  assert.strictEqual(run("safeImg(__p)", {__p: PNG + '"onerror="x'}), null);
});

console.log(process.exitCode ? "import.test.js: HÁ FALHAS" : "import.test.js: todos os " + passed + " testes passaram");
