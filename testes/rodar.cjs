// Roda os testes e mostra um resumo. Uso (dentro da pasta testes):
//   npm run tudo         banco + regras + navegador
//   npm run banco        só o banco (Postgres local, sem internet)
//   npm run unidade      só as regras puras (planilhas, lembretes)
//   npm run navegador    só o navegador (sobe o site local e o Supabase falso sozinho)
//
// NADA aqui toca o banco de verdade: o banco é um Postgres que roda na memória
// (pglite) e o navegador fala com um Supabase falso (navegador/banco-falso.cjs).

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const AQUI = __dirname;
const PROJETO = path.join(AQUI, "..");
const qual = process.argv[2] || "tudo";
const resultados = [];

function rodar(arquivo, pasta) {
  const inicio = Date.now();
  const r = spawnSync(process.execPath, [arquivo], { cwd: pasta, encoding: "utf8", env: process.env, timeout: 15 * 60 * 1000 });
  const saida = `${r.stdout || ""}${r.stderr || ""}`;
  const falhas = (saida.match(/^FALHA /gm) || []).length;
  const quebrou = r.status !== 0 && falhas === 0;
  resultados.push({ teste: `${path.basename(pasta)}/${arquivo}`, ok: r.status === 0, falhas, segundos: Math.round((Date.now() - inicio) / 1000) });
  const linha = r.status === 0 ? "ok" : quebrou ? "ERRO" : `${falhas} falha(s)`;
  console.log(`${r.status === 0 ? "✔" : "✘"} ${path.basename(pasta)}/${arquivo.padEnd(26)} ${linha}`);
  if (r.status !== 0) {
    for (const l of saida.split("\n").filter((x) => /^FALHA |ERRO NO TESTE|Error/.test(x)).slice(0, 6)) console.log("      " + l.trim().slice(0, 200));
  }
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function noAr(url, ms) {
  const ate = Date.now() + ms;
  while (Date.now() < ate) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return true;
    } catch {
      /* ainda subindo */
    }
    await esperar(1500);
  }
  return false;
}

// Processos que estão escutando numa porta (Windows: netstat; outros: lsof).
function quemUsaAPorta(porta) {
  if (process.platform === "win32") {
    const r = spawnSync("netstat", ["-ano"], { encoding: "utf8" });
    return [...new Set((r.stdout || "").split(/\r?\n/).filter((l) => l.includes(`:${porta} `) && /LISTEN/i.test(l)).map((l) => l.trim().split(/\s+/).pop()))].filter((p) => p && p !== "0");
  }
  const r = spawnSync("lsof", ["-ti", `tcp:${porta}`], { encoding: "utf8" });
  return (r.stdout || "").split(/\r?\n/).filter(Boolean);
}
function derrubar(pid) {
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  else spawnSync("kill", ["-9", String(pid)], { stdio: "ignore" });
}

// Sobe o Supabase falso e o site (porta 3001) com as variáveis pedidas, roda
// a lista de testes e desliga tudo.
async function rodada(titulo, testes, variaveis) {
  const pasta = path.join(AQUI, "navegador");
  // um site esquecido ligado nessas portas faria os testes falarem com ele
  for (const porta of [3001, 54321]) {
    if (quemUsaAPorta(porta).length) {
      console.log(`\nA porta ${porta} já está em uso (outro site ou teste ligado). Feche-o e rode de novo.`);
      resultados.push({ teste: "navegador (porta ocupada)", ok: false, falhas: 0, segundos: 0 });
      return;
    }
  }
  console.log(`\n${titulo}: subindo o Supabase falso e o site local (porta 3001)…`);
  const falso = spawn(process.execPath, ["banco-falso.cjs"], { cwd: pasta, env: { ...process.env, MOCK_SORTEAR: "1" }, stdio: "ignore" });
  const comando = process.platform === "win32" ? ["cmd.exe", ["/c", "npx", "next", "dev", "-p", "3001"]] : ["npx", ["next", "dev", "-p", "3001"]];
  const site = spawn(comando[0], comando[1], {
    cwd: PROJETO,
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_ANON_KEY: "chave-de-teste", ...variaveis },
    stdio: "ignore",
  });
  try {
    if (!(await noAr("http://127.0.0.1:54321/__log", 30000))) throw new Error("o Supabase falso não subiu");
    if (!(await noAr("http://localhost:3001/", 240000))) throw new Error("o site local não subiu");
    // primeira abertura de cada tela compila a página: abre antes para os testes não esperarem
    for (const p of ["/", "/admin", "/admin/operacao", "/consulta", "/privacidade", "/nova-senha", "/cardapio"]) await noAr("http://localhost:3001" + p, 240000);
    for (const t of testes) if (fs.existsSync(path.join(pasta, t))) rodar(t, pasta);
  } finally {
    // desliga tudo, inclusive o que o "npx" abriu por baixo
    derrubar(site.pid);
    falso.kill();
    for (const porta of [3001, 54321]) for (const pid of quemUsaAPorta(porta)) derrubar(pid);
    await esperar(1500);
  }
}

async function navegador() {
  // ordem importa: "fumaca" usa a reserva que "agenda" cria; "senha" troca a senha de teste (fica por último)
  await rodada("site sem captcha", ["e2e-almoco.cjs", "e2e-agenda.cjs", "e2e-fumaca.cjs", "e2e-datas.cjs", "e2e-fila.cjs", "e2e-acesso.cjs", "e2e-mfa.cjs", "e2e-csv.cjs", "e2e-movimento.cjs", "e2e-cardapio.cjs", "e2e-lgpd.cjs", "e2e-cliente.cjs", "e2e-senha.cjs"], {});
  // captcha ligado, com as chaves de TESTE da Cloudflare (sempre aprovam); quem confere o passe é o Supabase falso
  await rodada("site com captcha", ["e2e-captcha.cjs"], {
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    TURNSTILE_SECRET_KEY: "segredo-de-teste",
    TURNSTILE_VERIFICAR_URL: "http://127.0.0.1:54321/__turnstile",
    SUPABASE_SERVICE_ROLE_KEY: "chave-de-servico",
  });
}

(async () => {
  if (qual === "tudo" || qual === "unidade") {
    console.log("\n— regras puras —");
    for (const t of fs.readdirSync(path.join(AQUI, "unidade")).filter((f) => /^teste-.*\.cjs$/.test(f))) rodar(t, path.join(AQUI, "unidade"));
  }
  if (qual === "tudo" || qual === "banco") {
    console.log("\n— banco (Postgres local) —");
    for (const t of fs.readdirSync(path.join(AQUI, "banco")).filter((f) => /^teste-.*\.mjs$/.test(f))) rodar(t, path.join(AQUI, "banco"));
  }
  if (qual === "tudo" || qual === "navegador") await navegador();

  const ruins = resultados.filter((r) => !r.ok);
  console.log(`\n${resultados.length} testes, ${ruins.length ? `${ruins.length} com problema` : "todos passaram"}.`);
  process.exit(ruins.length ? 1 : 0);
})();
