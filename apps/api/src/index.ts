import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { bodyLimit } from "hono/body-limit";
import { csrf } from "hono/csrf";
import { secureHeaders } from "hono/secure-headers";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { anuncioRoutes } from "./anuncio/routes.js";
import { assuncaoRoutes } from "./assuncao/routes.js";
import { inteligenciaRoutes } from "./inteligencia/routes.js";
import { atualizarPainelPublicado as atualizarPainelInteligencia, handleInteligenciaInteraction } from "./inteligencia/discord.js";
import { atualizarPaineisPublicados as atualizarPaineisAssuncao, handleAssuncaoInteraction } from "./assuncao/discord.js";
import { corregedoriaRoutes } from "./corregedoria/routes.js";
import { disciplinaRoutes } from "./disciplina/routes.js";
import { aoMensagemNaReuniao, atualizarPainelPublicado as atualizarPainelDisciplina, handleDisciplinaInteraction } from "./disciplina/discord.js";
import { aoMensagemNoTicket, atualizarPainelPublicado as atualizarPainelCorregedoria, handleCorregedoriaInteraction } from "./corregedoria/discord.js";
import { promocaoRoutes } from "./promocao/routes.js";
import { pontoRoutes } from "./ponto/routes.js";
import { doespRoutes } from "./doesp/routes.js";
import { boletimRoutes } from "./boletim/routes.js";
import { aoMensagemNoBoletim } from "./boletim/discord.js";
import { iniciarRelatorioSistema } from "./boletim/relatorio.js";
import { ocorrenciaRoutes } from "./ocorrencia/routes.js";
import { hierarquiaRoutes } from "./hierarquia/routes.js";
import { comunicadoRoutes } from "./comunicado/routes.js";
import { arsenalRoutes } from "./arsenal/routes.js";
import { handleArsenalInteraction } from "./arsenal/discord.js";
import { atualizarPainelPublicado as atualizarPainelArsenal } from "./arsenal/service.js";
import { aoMensagemNoComunicado, handleComunicadoInteraction, iniciarRotinaComunicado } from "./comunicado/discord.js";
import { atualizarPainelPublicado as atualizarPainelComunicado } from "./comunicado/service.js";
import { agendarAtualizacao as atualizarHierarquia, atualizarComLogoNova as hierarquiaLogoNova } from "./hierarquia/service.js";
import { aoMensagemNaOcorrencia, handleOcorrenciaInteraction, iniciarRotinaOcorrencia } from "./ocorrencia/discord.js";
import { iniciarResumoSemanal } from "./ocorrencia/resumo.js";
import { atualizarPainelPublicado as atualizarPainelOcorrencia } from "./ocorrencia/service.js";
import { aoMensagemNoRascunho, handleDoespInteraction, iniciarRotinaDoesp, retomarMidias } from "./doesp/discord.js";
import { publicarPainel as atualizarPainelDoesp } from "./doesp/service.js";
import { doespStore } from "./doesp/store.js";
import { handlePontoInteraction, registrarComandosPonto } from "./ponto/discord.js";
import { handleInatividadeInteraction, iniciarRotinaInatividade } from "./ponto/inatividade.js";
import { aoMembroSairPonto, aoMensagemNoAjuste, aoMudarVoz, atualizarTodosAgora as atualizarPaineisPonto, conferirVoz } from "./ponto/service.js";
import { handlePromocaoInteraction, registrarComandosPromocao } from "./promocao/discord.js";
import { adicionarCargoRoutes } from "./adicionar-cargo/routes.js";
import { horasRoutes } from "./horas/routes.js";
import { iniciarRotinaHoras, verificarHoras, verificarTodos as verificarTodasHoras } from "./horas/service.js";
import { handleAdicionarCargoInteraction, registrarComandoAdicionarCargo } from "./adicionar-cargo/discord.js";
import { atualizarPainelPublicado as atualizarPainelAnuncio, handleAnuncioInteraction } from "./anuncio/discord.js";
import { authRoutes } from "./auth/discord.js";
import { gerenciaEquipe, isAdmin, isAdminTotal, modulosAdmin, noModulo } from "./auth/guards.js";
import { equipeRoutes } from "./equipe/routes.js";
import { equipeStore } from "./equipe/store.js";
import { brandingRoutes } from "./branding/routes.js";
import { getSession } from "./auth/sessions.js";
import { env, isProd } from "./env.js";
import { cursoRoutes, onConfigSalva } from "./curso/routes.js";
import { onCargosAlterados, onInteraction, onMembroEntrou, onMembroSaiu, onMensagem, onPronto, onVoz, startGateway } from "./discord/gateway.js";
import { entradaSaidaRoutes } from "./entrada-saida/routes.js";
import { logoAtual, marcarVersaoNasMensagens, onLogoAlterada, registrarAtualizadorPaineis, versaoNasMensagens, type RelatorioPaineis } from "./branding/logo.js";
import { atualizarMensagensAntigas } from "./branding/mensagensAntigas.js";
import { handlePerfilInteraction, registrarComandoPerfil } from "./perfil/discord.js";
import { handleCursoInteraction, limparPainelAntigo, registrarComandoCurso, registrarComandoRemover, sincronizarTurmasAtivas } from "./curso/discord.js";
import { sincronizarEmojiLogo } from "./branding/emoji.js";
import { atualizarPainelPublicado, handleSetInteraction } from "./set/discord.js";
import { aoMembroSair, limparCanaisEncerrados } from "./set/service.js";
import { setRoutes } from "./set/routes.js";
import { onPatentesMudaram } from "./set/store.js";
import { rateLimit } from "./security/rate-limit.js";

const app = new Hono();

/* ---------- Camada de segurança global ---------- */

app.use(
  "*",
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https://cdn.discordapp.com"],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      objectSrc: ["'none'"],
      ...(isProd ? { upgradeInsecureRequests: [] } : {}),
    },
    strictTransportSecurity: isProd ? "max-age=63072000; includeSubDomains; preload" : false,
    xFrameOptions: "DENY",
    referrerPolicy: "strict-origin-when-cross-origin",
    crossOriginOpenerPolicy: "same-origin",
    crossOriginResourcePolicy: "same-origin",
    permissionsPolicy: { camera: [], microphone: [], geolocation: [], payment: [] },
  }),
);

// Bloqueia POST/PUT/DELETE vindos de outros sites.
app.use("/api/*", csrf({ origin: env.WEB_ORIGIN }));
// 64 KB para tudo, exceto o envio da logo (tem limite próprio de 2 MB na rota).
const limiteJson = bodyLimit({ maxSize: 64 * 1024, onError: (c) => c.json({ error: "payload_grande" }, 413) });
app.use("/api/*", (c, next) => (c.req.method === "PUT" && c.req.path === "/api/branding/logo" ? next() : limiteJson(c, next)));
app.use("/api/*", rateLimit({ name: "api", limit: 120, windowMs: 60_000 }));
app.use("/api/*", async (c, next) => {
  await next();
  // Respostas da API não ficam em cache — exceto as que já definem o próprio (a imagem da logo).
  if (!c.res.headers.has("Cache-Control")) c.header("Cache-Control", "no-store");
});

/* ---------- Módulo da requisição (permissões da Equipe por módulo) ---------- */

// /api/<modulo>/… → isAdmin(session) passa a responder "é admin DESTE módulo?".
app.use("/api/:modulo", (c, next) => noModulo(c.req.param("modulo"), next));
app.use("/api/:modulo/*", (c, next) => noModulo(c.req.param("modulo"), next));

/* ---------- Rotas ---------- */

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/auth", authRoutes);
app.route("/api/set", setRoutes);
app.route("/api/entrada-saida", entradaSaidaRoutes);
app.route("/api/curso", cursoRoutes);
app.route("/api/branding", brandingRoutes);
app.route("/api/anuncio", anuncioRoutes);
app.route("/api/assuncao", assuncaoRoutes);
app.route("/api/inteligencia", inteligenciaRoutes);
app.route("/api/corregedoria", corregedoriaRoutes);
app.route("/api/disciplina", disciplinaRoutes);
app.route("/api/promocao", promocaoRoutes);
app.route("/api/adicionar-cargo", adicionarCargoRoutes);
app.route("/api/horas", horasRoutes);
app.route("/api/equipe", equipeRoutes);
app.route("/api/ponto", pontoRoutes);
app.route("/api/doesp", doespRoutes);
app.route("/api/boletim", boletimRoutes);
app.route("/api/ocorrencia", ocorrenciaRoutes);
app.route("/api/hierarquia", hierarquiaRoutes);
app.route("/api/comunicado", comunicadoRoutes);
app.route("/api/arsenal", arsenalRoutes);

app.get("/api/me", (c) => {
  const session = getSession(c);
  if (!session) return c.json({ error: "nao_autenticado" }, 401);
  return c.json({
    user: session.user,
    context: session.context,
    guildMember: session.guildMember,
    expiresAt: session.expiresAt,
    admin: isAdmin(session),
    isDeveloper: env.DEVELOPER_DISCORD_IDS.includes(session.user.id),
    /** O que a pessoa administra e vê no menu (Equipe do painel). */
    permissoes: {
      total: isAdminTotal(session),
      modulos: modulosAdmin(session),
      gerenciaEquipe: gerenciaEquipe(session),
      /** Acesso personalizado: o menu mostra só os módulos liberados. */
      restrito: equipeStore.membro(session.user.id)?.acesso === "personalizado",
      funcao: equipeStore.membro(session.user.id)?.funcao ?? null,
    },
  });
});

app.all("/api/*", (c) => c.json({ error: "nao_encontrado" }, 404));

/* ---------- Produção: a própria API serve o front (mesma origem) ---------- */

if (isProd) {
  // O build da API fica em apps/api/dist/src/index.js; o site compilado fica
  // em apps/web/dist. Em produção ambos são empacotados na mesma app Discloud.
  const distDir = fileURLToPath(new URL("../../web/dist/", import.meta.url));
  if (existsSync(distDir)) {
    const indexHtml = readFileSync(`${distDir}index.html`, "utf8");
    app.use("/assets/*", async (c, next) => {
      await next();
      c.header("Cache-Control", "public, max-age=31536000, immutable");
    });
    app.use("*", serveStatic({ root: distDir }));
    app.get("*", (c) => c.html(indexHtml)); // rotas do SPA
  } else {
    console.warn("[PMERJ] apps/web/dist não encontrado — rode `npm run build:web`.");
  }
}

/* ---------- Erros: nunca vazar detalhes internos ---------- */

app.onError((err, c) => {
  // Erros esperados (CSRF bloqueado, payload grande...) mantêm o status próprio.
  if (err instanceof HTTPException) {
    if (err.status === 403) console.warn(`[seguranca] 403 ${c.req.method} ${c.req.path}`);
    return c.json({ error: err.status === 403 ? "proibido" : "requisicao_invalida" }, err.status);
  }
  console.error("[erro]", err);
  return c.json({ error: "erro_interno" }, 500);
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.info(`[PMERJ] API rodando em http://localhost:${info.port} (${env.NODE_ENV})`);
});

/* ---------- Bot do Discord: eventos em tempo real ---------- */

onInteraction(handleSetInteraction);
onInteraction(handleAnuncioInteraction);
// Assunção de Serviço: botão "Assumir serviço" → formulário da guarnição → resultado no canal.
onInteraction(handleAssuncaoInteraction);
// Assunção de Serviço Inteligência: painel → formulário (policiais, objeto, fotos/link) → canal.
onInteraction(handleInteligenciaInteraction);
onInteraction(handlePerfilInteraction);
onInteraction(handleCorregedoriaInteraction);
onMensagem(aoMensagemNoTicket);
onInteraction(handleDisciplinaInteraction);
onMensagem(aoMensagemNaReuniao);
onInteraction(handlePromocaoInteraction);
// /adicionar-cargo: painel V2 (membro → cargo → confirmar), só para os cargos liberados no painel.
onInteraction(handleAdicionarCargoInteraction);
// Bate-ponto: botões, aprovação, /zerar e /ajuste ponto; canais de voz; mensagens do canal de ajuste.
onInteraction(handlePontoInteraction);
// Inatividade: X dias sem ponto → canal com o relatório (Exoneração / Cancelar); cargo de ausência nunca entra.
onInteraction(handleInatividadeInteraction);
iniciarRotinaInatividade();
// Sistema de Horas: alerta "apto para promoção" quando bate as horas; promovido → alerta atualizado.
onCargosAlterados(async (userId) => void (userId === "*" ? verificarTodasHoras() : verificarHoras(userId)));
iniciarRotinaHoras();
// Pedir Set = fonte única das patentes: mudou lá → hierarquia redesenha e o Sistema de Horas reconfere.
onPatentesMudaram(() => {
  atualizarHierarquia();
  void verificarTodasHoras();
});
// DOESP (requerimento ao Comando): botões, fotos/vídeos no canal temporário, rotina que apaga os canais.
onInteraction(handleDoespInteraction);
onMensagem(aoMensagemNoRascunho);
onPronto(retomarMidias);
iniciarRotinaDoesp();
// Boletim Interno: mensagem no canal → bot apaga e republica em painel V2 (errada → explicação só para a pessoa).
onMensagem(aoMensagemNoBoletim);
// Ocorrência: painel → modal do tipo → canal temporário (relato, participantes, fotos) → canal das ocorrências.
onInteraction(handleOcorrenciaInteraction);
onMensagem(aoMensagemNaOcorrencia);
iniciarRotinaOcorrencia();
// Toda segunda (09:00 de Brasília): resumo das apreensões da semana no canal de logs.
iniciarResumoSemanal();
// Boletim Interno: relatório de tudo o que aconteceu no sistema, a cada X horas (padrão 2h).
iniciarRelatorioSistema();
// Hierarquia: o painel acompanha troca de cargo, entrada, saída e apelido (agrupado, só edita se mudou).
onCargosAlterados(async () => atualizarHierarquia());
onMembroEntrou(async () => atualizarHierarquia());
onMembroSaiu(async () => atualizarHierarquia());
// Comunicados de Operação: painel → canal temporário (dados, canal, cargos, mídias, prévia) → canal escolhido.
onInteraction(handleComunicadoInteraction);
onMensagem(aoMensagemNoComunicado);
iniciarRotinaComunicado();
// Retirada de Baú: select do painel → formulário (retirar · devolver · perda · recuperar) → canais de registro.
onInteraction(handleArsenalInteraction);
onVoz(aoMudarVoz);
onMensagem(aoMensagemNoAjuste);
onPronto(conferirVoz);
onMembroSaiu((m) => aoMembroSairPonto(m.id));
void registrarComandosPonto().then((ok) => ok && console.info("[ponto] comandos /zerar e /ajuste registrados"));
void registrarComandosPromocao().then((ok) => ok && console.info("[promocao] comandos /promoção e /rebaixamento registrados"));
void registrarComandoAdicionarCargo().then((ok) => ok && console.info("[adicionar-cargo] comando /adicionar-cargo registrado"));
onInteraction(handleCursoInteraction);
// Cursos: mensagens das turmas acompanham o cadastro e a logo; /remover curso; some o painel antigo.
onConfigSalva(() => void sincronizarTurmasAtivas());
void registrarComandoRemover().then((ok) => ok && console.info("[curso] comando /remover curso registrado"));
void registrarComandoCurso().then((ok) => ok && console.info("[curso] comando /curso registrado"));
void limparPainelAntigo();
// /perfil no servidor oficial (cria ou atualiza; não mexe em outros comandos).
void registrarComandoPerfil().then((ok) => ok && console.info("[perfil] comando /perfil registrado"));
onMembroSaiu((m) => aoMembroSair(m.id));
/* ---------- Logo em todos os painéis, de uma vez ---------- */

/**
 * Primeiro o emoji novo do rodapé (senão os painéis sairiam com o antigo, que é apagado),
 * depois cada painel publicado, um por vez. Roda quando o bot conecta, quando a logo é trocada
 * em Aparência e pelo botão "Atualizar todos os painéis". Duas chamadas seguidas não se atropelam.
 */
let rodando: Promise<RelatorioPaineis> | null = null;
let deNovo = false;
let forcarDeNovo = false;
async function atualizarTodosPaineis(forcarMensagens = false): Promise<RelatorioPaineis> {
  if (rodando) {
    deNovo = true;
    forcarDeNovo ||= forcarMensagens;
    return rodando;
  }
  rodando = (async () => {
    const relatorio: RelatorioPaineis = [];
    do {
      deNovo = false;
      relatorio.length = 0;
      await sincronizarEmojiLogo().catch((err: unknown) => console.warn("[branding] emoji da logo:", err));
      const tarefas: Array<[string, () => unknown]> = [
        ["Pedir Set", atualizarPainelPublicado],
        ["Anúncio", atualizarPainelAnuncio],
        ["Assunção de Serviço", atualizarPaineisAssuncao],
        ["Assunção Inteligência", atualizarPainelInteligencia],
        ["Corregedoria", atualizarPainelCorregedoria],
        ["Disciplina", atualizarPainelDisciplina],
        ["Bate-ponto", atualizarPaineisPonto],
        ["DOESP", () => (doespStore.config().panelMessageId ? atualizarPainelDoesp(false) : null)],
        ["Ocorrência", atualizarPainelOcorrencia],
        ["Comunicados de Operação", atualizarPainelComunicado],
        ["Retirada de Baú", atualizarPainelArsenal],
        ["Cursos (turmas abertas)", sincronizarTurmasAtivas],
        ["Hierarquia", hierarquiaLogoNova],
      ];
      for (const [painel, fn] of tarefas) {
        try {
          await fn();
          relatorio.push({ painel, ok: true });
        } catch (err) {
          console.warn(`[branding] painel ${painel} não atualizado:`, err instanceof Error ? err.message : err);
          relatorio.push({ painel, ok: false });
        }
      }
      // Mensagens já enviadas: só quando a logo mudou desde a última varredura (ou pelo botão).
      const versao = logoAtual()?.versao;
      if (versao && (forcarMensagens || forcarDeNovo || versaoNasMensagens() !== versao)) {
        forcarDeNovo = false;
        try {
          const r = await atualizarMensagensAntigas();
          await marcarVersaoNasMensagens(versao);
          relatorio.push({ painel: `Mensagens já enviadas (${r.atualizadas} em ${r.canais} canais)`, ok: r.falhas === 0 });
        } catch (err) {
          console.warn("[branding] mensagens antigas:", err instanceof Error ? err.message : err);
          relatorio.push({ painel: "Mensagens já enviadas", ok: false });
        }
      }
    } while (deNovo);
    console.info(`[branding] painéis atualizados com a logo atual (${relatorio.filter((r) => r.ok).length}/${relatorio.length}).`);
    return relatorio;
  })().finally(() => (rodando = null));
  return rodando;
}
registrarAtualizadorPaineis(atualizarTodosPaineis);
onLogoAlterada(() => void atualizarTodosPaineis());
onPronto(async () => void atualizarTodosPaineis()); // sem esperar: os outros módulos seguem ligando

void startGateway().then(limparCanaisEncerrados);
