# PMERJ — Portal e Painel Militar

Polícia Militar do Estado do Rio de Janeiro · dashboard integrada ao Discord.

| Pasta | O que é |
|---|---|
| `apps/web` | Front-end — Vite + React + TSX + Tailwind |
| `apps/api` | Servidor — Hono (TS): login Discord OAuth2, sessões, segurança |

## Primeira execução

1. **Discord Developer Portal** → crie a aplicação → *OAuth2*
   - Copie **Client ID** e **Client Secret**
   - Em *Redirects*, adicione: `http://localhost:5173/api/auth/discord/callback`
2. Configure o ambiente:
   ```bash
   cp apps/api/.env.example apps/api/.env   # preencha os valores
   npm install
   ```
3. Rode (sobe site + API juntos):
   ```bash
   npm start   # abra http://localhost:5173
   ```

## Produção (Discloud + MongoDB)

Os dados ficam no **MongoDB da Discloud** (mesmo esquema do sistema do BOPE): com `MONGODB_URI` definida, cada módulo
vira um documento da coleção `dados` e fotos, vídeos e provas vão para o GridFS `arquivos`. Sem ela (desenvolvimento),
tudo continua em `apps/api/data/`. **Na primeira subida com o banco, o que existir em `apps/api/data/` é importado sozinho.**

1. Crie o banco MongoDB na Discloud e copie a URI
2. No painel da Discloud, crie as variáveis do `.env.discloud.example` (`MONGODB_URI`, Discord, `WEB_ORIGIN`…)
3. Ajuste o `ID` (subdomínio) no `discloud.config` e cadastre `https://<ID>.discloud.app/api/auth/discord/callback`
   em Discord Developer Portal → OAuth2 → Redirects
4. Coloque `DISCLOUD_TOKEN` no `.env` da raiz (nunca no chat) e rode:
   ```bash
   npm run discloud   # build + discloud-upload.zip + envio pela API
   ```
O zip leva só código compilado (`.discloudignore`): sem `.env`, sem `apps/api/data`. O `scripts/discloud-start.mjs` sobe
na porta 8080, em produção e atrás do proxy. Em produção a API se recusa a subir sem `MONGODB_URI`.

## Segurança (regra nº 1)

- Login **somente** via Discord OAuth2 com PKCE + `state` de uso único (10 min)
- Token do Discord descartado e revogado logo após o login — nada sensível é guardado
- Sessão em cookie `httpOnly` · `SameSite=Lax` · `Secure` + `__Host-` em produção; servidor guarda só o hash SHA-256
- Painel exige ser membro do servidor oficial (`DISCORD_GUILD_ID`)
- Proteção CSRF (checagem de Origin), rate limit por IP, limite de payload
- Headers: CSP estrita, HSTS, X-Frame-Options DENY, COOP/CORP, Permissions-Policy
- Validação com Zod em todas as entradas e no `.env` (a API não sobe com config insegura)
- Fontes self-hosted (sem CDN de terceiros), sourcemaps desligados em produção
- `.env` fora do Git

## Bot do Discord

- `DISCORD_BOT_TOKEN` + `DISCORD_GUILD_ID` no `.env`. O bot fica conectado ao Discord (gateway, `discord.js`)
  para receber entradas/saídas e cliques no painel — funciona em `localhost`, sem URL pública
- Developer Portal → **Bot** → ligar **Server Members Intent**
- Permissões: *Gerenciar Apelidos*, *Ver Canais*, *Enviar Mensagens*, *Inserir Links*; cargo do bot **acima** dos policiais
- Admin do painel: `PAINEL_ADMIN_IDS` / `PAINEL_ADMIN_ROLE_IDS` (em dev, sem nenhum, todos são admin)

## Pedir Set (`/painel/set`)

- Policial informa **patente**, **nome de guerra** e **ID** (+ órgão, se ativado) e o bot aplica o apelido **na hora**
- Apelido pelo modelo (padrão `{prefixo} {nome} | {id}` → `3º SGT Silva | 1234`), máx. 32 caracteres
- Pelo **site** ou pelo **Discord**: o admin publica um painel (Components V2) com o botão *Pedir set*,
  que abre um formulário dentro do Discord
- Abas: Meu set · Recentes · Configurações (admin: campos, formato, patentes, órgãos, canal de log, painel no Discord)
- Dados em `apps/api/data/set.json` (fora do Git)
- **Fonte única das patentes**: patentes, siglas, ordem (= hierarquia, de baixo para cima) e **cargo de cada patente** se
  configuram SÓ aqui (um cargo por patente). Promoções/Rebaixamento, Hierarquia (modo "Puxar do Pedir Set"), Sistema de
  Horas, Cursos (patente mínima), Adicionar Cargo e /perfil puxam daqui. Mudou aqui → o painel da Hierarquia redesenha e o
  Sistema de Horas reconfere sozinhos. **Vincular pelo nome** preenche os cargos das patentes procurando cargos do Discord
  com o mesmo nome ou sigla

## Entrada e Saída (`/painel/entrada-saida`)

- O bot anuncia quando alguém **entra** ou **sai** do servidor (mensagens em Components V2 com avatar)
- Admin escolhe canal, título, mensagem (`{membro}` `{nome}` `{usuario}` `{servidor}` `{total}`), cor e detalhes,
  com prévia ao vivo e botão de teste
- Aba Atividade: últimas entradas/saídas, membros, saldo da semana; destaca contas recém-criadas
- Dados em `apps/api/data/entrada-saida.json` (fora do Git)

## Aparência (`/painel/aparencia`, só admin)

- Logo da corporação usada no menu, login, rodapé, ícone da aba e nas mensagens do bot (anexada, funciona em localhost)
- Padrão: brasão da PMERJ (`apps/api/assets/brasao-pmerj.png`). O admin envia outra (PNG/JPG/WebP até 2 MB; SVG bloqueado)
  ou restaura o padrão. A personalizada fica em `apps/api/data/branding/` (fora do Git)

## Cursos (`/painel/cursos`) e Cadastro de cursos (`/painel/cursos/cadastro`, só admin)

- **/curso** (instrutores): modal V2 com o curso (menu), **data e horário** (Brasília: `20:00`, `15/11 20:00`…) e vagas.
  Ao enviar: turma aberta + **evento do servidor** criado (Discord → Eventos) + mensagem da turma postada.
  O evento acompanha a turma na hora: Iniciar → *em andamento*; Finalizar → *encerrado*; Cancelar → *cancelado*
- Fluxo: instrutor **agenda a turma** (/curso ou site) → o bot posta no *canal das turmas* uma mensagem com **Entrar no curso / Sair do curso**
  → **Iniciar curso** trava (os dois botões ficam desativados) → **Finalizar curso** entrega o curso **e o cargo a todos os
  participantes** automaticamente. Também dá para cancelar a turma (ninguém recebe) e tirar alguém antes de finalizar
- Funciona igual pelo site (Cursos → Meu curso / Gestão) e pelos botões no Discord (Iniciar/Finalizar pedem confirmação)
- Cada curso: sigla, nome, descrição, patente mínima (usa o set), **cargo entregue ao concluir** e instrutores do curso (opcional)
- **Instrutores gerais**: cargos que instruem todos os cursos. Instrutor = geral OU do curso, conferido no Discord a cada ação
  (sem exceção para admin; admin só cadastra)
- **/remover curso** — só para os cargos de "Quem pode remover cursos". Painel V2 efêmero: escolhe o policial (✖️ ao lado do
  nome para trocar), o curso, e confirma; o cargo do curso é retirado. O comando nasce escondido (`default_member_permissions: 0`):
  libere os cargos em Configurações do servidor → Integrações → PMERJ. O bot confere o cargo de novo em todo passo
- Curso com turmas não pode ser apagado — desative. Dados em `apps/api/data/curso.json` (versões antigas migram sozinhas)
- **Certificados**: ao **Finalizar** a turma, cada participante ganha um certificado (nº sequencial + código
  `SIGLA-TURMA-NÚMERO`) postado no *canal dos certificados* (Cadastro de cursos) — mensagem V2 dourada com a logo, a **foto
  do servidor** da pessoa (avatar do servidor; sem ele, o da conta), curso, turma, instrutor e data; só o formado é notificado.
  Postagem em segundo plano, um por vez. No site: aba **Certificados** de cada curso (busca por nome/código, "Ver no Discord";
  o instrutor emite os de quem concluiu antes e publica de novo o que falhou). /remover curso marca o certificado como
  **revogado** (a mensagem é atualizada). O /perfil mostra o link do certificado

## /perfil (Discord)

- `/perfil [membro]` — qualquer membro usa. Mostra set (patente, ID, órgão), cursos concluídos (turma, data, cargo)
  e em andamento. Registrado sozinho no servidor quando a API sobe

## Adicionar Cargo (`/painel/adicionar-cargo`) e /adicionar-cargo (Discord)

- **/adicionar-cargo** — só para os cargos de "Quem pode usar" (o bot confere em todo passo). Painel V2 efêmero: membro
  (✖️ do menu desmarca) → cargo(s), até 5 → prévia (✅ recebe · ➖ já tem · ❌ bloqueado e por quê) → Confirmar
- **Cargos que podem ser dados**: com lista, o menu mostra só esses. Sem lista (qualquer cargo), valem as travas: nada acima
  do seu cargo mais alto, nada com permissões de administração (banir, gerenciar cargos/servidor…), nada de patente (use
  /promoção). Sempre: nunca cargos de bot/integração, nunca acima do cargo do bot, ninguém dá cargo a si mesmo
- **Quem vê o comando**: nasce escondido (`default_member_permissions: 0`). Em Configurações → **Aplicar no Discord**, o
  admin autoriza com a própria conta (escopo `applications.commands.permissions.update`; precisa de "Gerenciar servidor" e
  "Gerenciar cargos") e o comando passa a aparecer só para os cargos de uso. O token é usado uma vez e revogado; a sessão
  não muda. O painel mostra se a visibilidade está em dia com os cargos salvos
- Registro de cada cargo dado: histórico no site + mensagem V2 no canal de registro (sem notificar ninguém)

## Sistema de Horas (`/painel/horas`)

- **Requisitos por promoção** (Configurações): de → para, **horas comprovadas** (aprovadas no Bate-ponto), **cursos exigidos**
  (conferidos sozinhos pelo sistema de Cursos) e outros requisitos em texto (conferidos pelo Comando). Já vem com a escada
  SD→CB 10h · CB→3º SGT 35h + CFS + EAT · 3º→2º SGT 55h · 2º→1º SGT 70h + CAP · 1º SGT→ST 100h + CAP (siglas de curso que não
  existem no cadastro viram requisito em texto). Horas contam no total ou só desde a última promoção (configurável)
- **Alerta**: quem bate as horas da próxima patente ganha uma mensagem V2 dourada no canal de alertas (horas, cursos ✅/❌,
  requisitos a conferir), notificando os cargos escolhidos (ex.: Comando) só na primeira publicação. Cada pessoa que for
  batendo as horas gera o seu alerta. Promovido → o alerta vira **✅ Promovido**; na patente nova vale a próxima regra.
  Confere quando horas são aprovadas, quando cargos mudam, ao salvar e a cada 30 min
- Site: escada de requisitos (todos veem), **Minha progressão** (barra de horas + requisitos), **Aptos** e **Efetivo**
  (progresso de todos; para admin, gestão e aprovadores do ponto)

## Promoções (`/painel/promocoes`) e /promoção (Discord)

- **/promoção** — só para os cargos de "Quem pode promover" (nasce escondido: libere em Integrações; o bot confere o cargo
  em todo passo). Painel V2 efêmero: policial (✖️ ao lado para trocar) → patente (✖️) → prévia (patente atual → nova,
  apelido novo) → Confirmar. Ninguém promove a si mesmo
- Ao confirmar: tira o cargo da patente antiga (e de qualquer outra patente), dá o da nova, troca **só a sigla** do apelido
  (nome e ID ficam), registra no set e publica o anúncio (V2, avatar, 🎉) no canal configurado, notificando só o promovido
- Patente atual = cargo de patente que a pessoa tem → set registrado → sigla no começo do apelido
- As patentes (ordem, sigla, cargo) são as do **Pedir Set** — o cargo de cada uma pode ser editado nas duas telas
- Dados em `apps/api/data/promocao.json`

## Corregedoria (`/painel/corregedoria`) e transcript (`/transcript/<id>`)

- Painel V2 no canal com select de assuntos (Denúncia contra oficial · Assuntos internos · Outros — editáveis). Escolheu →
  confirmação com órgão, insígnia e nome (✖️ para trocar) → modal: motivo, assunto, descrição e **provas** (até 5 imagens/vídeos, 10 MB)
- Abre um canal temporário na categoria configurada, visível só para os cargos da corregedoria e quem abriu. Painel V2 com
  Assumir · Responder · Chamar oficial (DM com botão para o canal) · Fechar. Assumido → só quem abriu e quem assumiu escrevem
- **Anonimato**: mensagem da equipe no canal é apagada e reenviada por webhook com o nome de exibição (configurável) e a logo.
  O botão Responder (modal) evita até o "digitando…". O transcript de quem abriu nunca traz ID/nome do agente
- Fechar: DM para quem abriu + canal de log com botão para o transcript; canal apagado em 10 s
- Transcript abre **sem login** pelo link com a chave secreta do ticket (`?ticket=…&chave=…`, enviado na DM e no log); sem a chave,
  só a equipe logada. Mostra o canal como no Discord (painel do ticket, provas, conversa). Arquivos em `apps/api/data/corregedoria/`
- Exige **Message Content Intent** ligado no Developer Portal

## Disciplina (`/painel/disciplina`) — gestão da corregedoria

- Painel V2 (só cargos de gestão): **Chamar para reunião · Advertência · Exoneração**. Fluxo efêmero: pessoa (✖️ ao lado),
  nível (advertência), motivo opcional, confirmar
- **Reunião**: canal temporário (categoria configurada) só para a gestão e o convocado + DM com botão para o canal. Painel com
  status (aguardando/iniciada), Iniciar reunião, **Painel de gerenciamento da corregedoria** (Advertência, Remover advertência,
  Rebaixamento, Exoneração), Chamar novamente, Fechar canal. A gestão fala como a corregedoria (webhook). **Sem transcript**
- Advertência = cargo do nível (tira os outros níveis) · Remover = tira os cargos de nível · Exoneração = DM com motivo + expulsão
  · Rebaixamento = regras e canal de Promoções. Cada medida é anunciada no canal configurado e aparece no **/perfil**
- **/rebaixamento** (Promoções → Rebaixamento: quem pode e canal do anúncio): só patentes abaixo da atual, motivo opcional
- /perfil: patente atual (pelo cargo), data da última promoção, advertência atual e histórico disciplinar

## Bate-ponto (`/painel/ponto`)

- **Painel Bate-ponto** (V2): *Entrar em serviço* · *Sair de serviço* · *Minhas horas*. **Efetivo em serviço** (V2): lista ao vivo
  de quem está com o ponto batido. **Ranking de horas** (V2): top 20, atualizado sozinho a cada aprovação. Os três são publicados
  em Configurações e se atualizam sozinhos
- **Ponto por voz**: entrar num dos canais de voz configurados bate o ponto; sair de todos fecha. Ao reconectar, o bot confere
  quem está nos canais (exige o intent de *Voice States*, já pedido pelo bot, e permissão de ver os canais)
- Ao fechar: abaixo do **tempo mínimo** → descartado. Senão abre um **canal temporário só para os aprovadores** com Aprovar/Reprovar
  (motivo opcional). **Só horas aprovadas contam** (total + ranking). O policial recebe DM com o resultado; o canal é apagado.
  Também dá para decidir pelo site (aba Aprovações). Ninguém aprova o próprio ponto
- **/zerar ranking** (o total continua) · **/zerar horas [policial]** (vazio = todos) — com confirmação
- **/ajuste ponto <policial>**: DM + canal temporário (gestão + policial) com exemplo. O policial envia `Entrada 19:30`, depois
  `Saída 23:45`, confirma no painel V2 e o canal é apagado. O ponto ajustado (aberto, pendente ou novo) vai para aprovação
- **Quem bate ponto: todo policial com set aprovado** no Pedir Set. Cargos: aprovadores · gestão (/zerar e /ajuste nascem escondidos: libere em Integrações)
- /perfil mostra status, horas aprovadas e posição no ranking. Dados em `apps/api/data/ponto.json`
- **Lembrete da assunção**: ao fechar o ponto (botão *Sair de serviço* ou saída do canal de voz), DM com painel V2 e botão
  de link que leva direto ao painel da Assunção de Serviço (um botão por painel publicado, até 5). Liga/desliga em Configurações
- **Inatividade** (Configurações → Inatividade, nasce desligada): X dias (padrão 5) sem bater ponto — contando do último ponto,
  da entrada no servidor, do dia em que a regra foi ligada ou do último caso cancelado, o mais recente. Confere a cada 30 min.
  *Revisão* (padrão): canal temporário só para "Quem decide" (vazio = gestão do ponto) com o **relatório de ponto** (no servidor
  desde, quantos pontos bateu desde que entrou — aprovados/pendentes/reprovados/descartados —, último ponto, horas) e os botões
  **Exoneração** / **Cancelar**. Exoneração = DM com o motivo ("falta de comparecimento, sem ter batido ponto"), expulsão,
  registro disciplinar (/perfil) e log com o motivo. Cancelar = a contagem recomeça. *Automático*: exonera direto.
  **Cargo de ausência** nunca é cobrado nem exonerado (conferido de novo no clique). Caso aberto se encerra sozinho se a pessoa
  bater ponto, ganhar ausência ou sair. Aba **Inatividade** no site lista os casos

## DOESP — Requerimento ao Comando (`/painel/doesp`)

Mesmo fluxo do sistema do BOPE:
- **Painel** (V2) com o botão *Novo requerimento* → abre um **canal temporário** (categoria configurável) só para quem abriu e os gestores:
  **Preencher** (um modal com os 5 campos) · fotos e vídeos **mandados como mensagem no canal** (o bot coleta, mostra no painel e
  apaga a mensagem) · **Enviar** · Limpar mídias · Cancelar. Ao enviar, o canal é apagado
- O requerimento sai no **canal dos requerimentos** no modelo oficial (Nº 001/2026 - P/2), marcando o **Comandante**:
  *Despachar* ✅ / *Indeferir* (motivo) → **1ª Companhia**: *Designar DOESP* (DOESP, efetivo, período) → *Encaminhar resultados à P/2* (texto)
- As imagens e vídeos da abertura saem só no **canal dos resultados**, em painéis V2 logo abaixo (cada um dentro do limite do servidor);
  o requerimento ganha o botão *Ver imagens e vídeos*. Se falhar, *Publicar de novo* no site
- Vídeos acima do limite do bot (10 MB no nível 1) e de até **4 minutos** são comprimidos (ffmpeg-static); maiores: link (YouTube/Drive).
  O servidor só baixa anexos da CDN do Discord — outros links viram botões
- Cargos: Chefes de Seção – P/2 · Comandante · Comando da 1ª Companhia · Gestores (página). Admins do painel fazem todas as etapas
- Rascunho aberto há mais de 6 h é cancelado. Após restart, mídias interrompidas (⏳) são retomadas.
  Dados em `apps/api/data/doesp.json` e arquivos em `apps/api/data/doesp/`

## Ocorrência (`/painel/ocorrencia`)

- Painel V2 "Registrar ocorrência" → modal com o tipo → canal temporário: relato (modal), participantes (select),
  **presos** e evidências (fotos mandadas no canal) → Enviar publica tudo no canal das ocorrências
- **Presos (obrigatório responder)**: select "Teve alguém preso?" Sim/Não. Sim → botão *Adicionar preso* abre um formulário
  com **nome**, **RG (ID na cidade)** e o **Discord** do preso (opcional), até 10; dá para remover da lista. O Enviar só
  libera com a resposta (e, se Sim, com pelo menos um preso). Os presos saem na ocorrência publicada e no site
- **Resumo semanal de apreensões**: toda segunda-feira, a partir das 09:00 (Brasília), sai no *canal de logs do resumo*
  um painel V2 com as ocorrências da semana anterior (segunda 00:00 → segunda 00:00) que tiveram apreensão (campo
  "Apreensões" preenchido ou tipo "Apreensão"), com material, local, responsável, mais os presos e os totais por tipo.
  Bot fora do ar na segunda → manda quando voltar (uma vez por semana). Botão *Enviar resumo agora* (últimos 7 dias)

## Boletim Interno automático (`/painel/boletim` → Configurações)

- A cada X horas (padrão **2h**, todos os dias, alinhado ao relógio de Brasília: 00h, 02h, 04h…) sai no canal escolhido o
  **BOLETIM INTERNO Nº 001/2026** no modelo oficial: cabeçalho (PMERJ · unidade · número · data) → **Resumo do Batalhão**
  (ocorrências, prisões, armas, drogas, veículos recuperados, operações, missões de inteligência) → **Principais ocorrências**
  (local — resumo, apreensão, presos) → **Atos internos** (promoções, designações = cargos dados, movimentações = inclusões
  no efetivo/rebaixamentos/exonerações, cursos, outras determinações) → **Operações e emprego do efetivo** (comunicados de
  operação, guarnições assumidas, bate-ponto com entrada/saída/horas) → **Determinações do Comando** (texto do site) →
  **Anexo** (boletins das equipes, baú, inatividade, corregedoria só números, DOESP, entradas/saídas, anúncios) →
  “Publique-se para conhecimento do efetivo.” e assinatura
- Números lidos das ocorrências: armas = quantidade no campo Apreensões ("1 pistola, 2 fuzis" = 3); drogas = ocorrências com
  droga no material; veículos = menção a veículo + "recuperado"; prisões = presos informados
- Limite do Discord: o que não couber sai em outro painel **“continuação do relatório (2/N)”**. Ninguém é notificado.
  Numeração própria, reinicia todo ano. Período sem nada: sai zerado (ou pula, se ligado). Bot fora do ar: ao voltar,
  cobre o buraco (até 24h). *Enviar prévia agora* manda sem gastar número. O boletim por mensagem no canal continua

## Equipe (`/painel/equipe`)

- Cadastre quem administra a dashboard **pelo nome, @usuário ou ID do Discord**, com uma **função** (texto livre: Comando-Geral,
  Moderador…) e, se quiser, um **cargo do Discord** (entregue ao salvar e retirado ao sair da equipe; nunca de bot e, para
  quem não é dono, nunca com permissão de administrador)
- Acesso: **Administrador** (vê e faz tudo, inclusive gerenciar a equipe) · **Acesso total** (vê e configura todos os
  módulos) · **Personalizado** (vê e configura só os módulos marcados; os outros somem do menu e a página fica bloqueada)
- Conferido pelo servidor em toda requisição: cada chamada `/api/<módulo>/…` sabe de qual módulo veio, e `isAdmin(session)`
  responde por aquele módulo. Os admins do `.env` (PAINEL_ADMIN_IDS / PAINEL_ADMIN_ROLE_IDS) continuam com tudo e não
  aparecem na lista. Ninguém altera o próprio acesso. Histórico de quem adicionou, alterou ou removeu

## Login cinematográfico (`/entrar`)

- É a página inicial (`/`, também em `/entrar`); a escolha civil/PMERJ antiga ficou em `/acesso` (link "Sou civil")
- Intro: vídeo de fundo escurecido + o brasão do sistema (o mesmo de Painel → Aparência) "Clique para acessar" → cena de login: vídeo nítido em tela cheia (véu escuro e
  granulado de filme), PMERJ em destaque e o botão "Entrar com Discord". Voltando de erro de login, abre direto na cena
- Vídeo: `apps/web/public/video/login-bg.mp4` (o mesmo do sistema do BOPE) e capa `login-poster.jpg` (primeiro quadro, aparece
  enquanto o vídeo carrega). Quem prefere menos movimento (configuração do sistema) continua vendo o vídeo e os efeitos da entrada (só o granulado fica parado)
- **Músicas**: coloque os arquivos em `apps/web/public/audio/` e liste em `apps/web/public/audio/playlist.json`:
  `[{ "arquivo": "faixa-1.mp3", "titulo": "Nome da música", "artista": "Artista" }]` (mp3/ogg/m4a/webm/wav, até 20).
  A música começa no clique do brasão (o navegador não deixa tocar som antes de um clique); player no canto com
  anterior/tocar/próxima, silenciar e volume (lembrado no navegador). Lista vazia = sem player
#   P M E R J - p o l i c i a  
 #   P M E R J - p o l i c i a  
 #   P M E R J - p o l i c i a  
 