# SmartFit Science — seu personal trainer e nutricionista de bolso

Um app (PWA, React + Vite + API Node nativa) que monta **dieta + treino + sono + hidratação + mente** a partir do
seu corpo e das suas escolhas alimentares, e justifica cada número com **literatura revisada por pares escolhida a
dedo pelo risco de conflito de interesse**. Tem abas separadas para onívoro, pescetariano, lacto-ovo-vegetariano,
ovo-vegetariano, lacto-vegetariano e vegano; tem progressão travada por nível (como jogo); tem lembretes que só
param quando você confirma; e tem a **Yayá**, uma IA que responde qualquer coisa **só com a base local e citando a
fonte** — quando não sabe, ela diz que não sabe.

> **Aviso honesto desde a primeira linha:** parte das referências foi montada sem rede no ambiente de build.
> Esses itens carregam `ck:0` no JSON e aparecem na interface com o selo **“verificar na fonte”** (número de DOI/PMID
> não conferido caractere a caractere). Onde o selo aparece, **abra o link antes de tratar o número como lei** — a
> recomendação estrutural se sustenta nas fontes `ck:1`, mas o valor exato (dose, hazard ratio, ano) precisa da sua
> conferência. A política completa está em [`docs/metodologia-auditoria.md`](docs/metodologia-auditoria.md).

Isto **não é** assistência médica. É uma camada de registro, cálculo e educação sobre o que você já faz; diagnóstico,
medicação e conduta em doença são de gente registrada (médico/nutricionista).

---

## Rodar

```bash
npm install            # React, Vite, TypeScript — só isso (a API usa node:sqlite, sem dependência)
npm run dev            # sobe web (:5173) + API (:8787) juntos
npm test               # node --test tests/*.test.ts  (biblioteca de cálculo, planner, viés, agenda, dados)
npm run validate       # valida o JSON da base (ids, refs cruzadas, poses, programas)
npm run build          # bundle estático em dist/
npm run preview        # serve o build com o service worker ativo (testa offline de verdade)
```

Requisitos: Node ≥ 22.5 (por causa do `node:sqlite` e do type-stripping do `node --test`).

## O que tem dentro

| Aba | O que faz |
| --- | --- |
| **Hoje** | Anéis de energia, proteína, água, fibra, passos e sono; treino do dia com figura animada; quests; **tabela de alertas pendentes**; mapa de calor de 13 semanas; sugestões ancoradas em fonte. |
| **Nutrição** | Uma aba por padrão alimentar (**onívoro, pescetariano, lacto-ovo-veg, ovo-veg, lacto-veg, vegano**), gerador de cardápio por refeição com metas reais, troca de alimento por equivalente, lista de compras + custo por grama de proteína, tabela de substituição, painel de riscos/lacunas do padrão. |
| **Treino & Níveis** | Mapa de 10 níveis com **🔒 por XP + chefe de reavaliação** (teste objetivo: flexões, prancha, 1RM estimado), executor de sessão série a série com RIR/carga/repos e timer de descanso, diagrama 2D do movimento, cues/erros/regressões/substituições por exercício, heat de volume por grupo, carga aguda:crônica, add-on de cardio. |
| **Ciência & Auditoria** | Navegador das 84 fontes (grau GRADE, financiamento, conflito, “como o app usa”, ressalva), **busca ao vivo** no OpenAlex/Crossref com classificação automática de risco de funding, e a auditoria: método, níveis de risco comercial, 8 casos documentados, táticas de marketing, listas de bloqueio, mitos, módulos extras. |
| **Yayá** | Chat com BM25 sobre a base + cápsulas, resposta personalizada com seus números, referências clicáveis, modo rigoroso, e opção de consultar a literatura ao vivo (a pergunta não sai do navegador a menos que você ligue isso). |
| **Tribo** | Feed com o seu nível/dieta/streak/emblemas, posts com **foto opcional**, perfis, ranking de constância, cartão público gerado por `projeçãoPublica()` (nunca expõe peso, medidas ou exames), botão de revisão curatorial. |
| **Evolução** | Curvas de peso, proteína, água, sono, passos e XP; composição estimada (US Navy); projeção de déficit; streaks e maratonas; emblemas; histórico de sessões; **painel de exames** sugeridos por dieta; exportar/importar/apagar dados. |
| **Ajustes** | Perfil antropométrico (recalcula tudo ao digitar), equipamento, restrições, condições que mudam os números (gestante, renal, DM2, pressão, dislipidemia, histórico de TCA), motor de alertas (backoff, teto de insistência, modo gentil, janela silenciosa), conta/servidor, PWA. |

### Além do que foi pedido (as ideias extras)

- **Onboarding em 9 passos** com preview ao vivo de TMB, gasto, alvo calórico, macros, água e riscos — você aceita os
  números, não engole pacote fechado.
- **Leucina por refeição** e proteína por refeitório (25–40 g), não só o total do dia (Morton 2018; van Vliet 2016).
- **Ajuste automático de proteína para dietas vegetais** (+0,1–0,2 g/kg, Clarys 2014) e meta de **cálcio/ferro/iodo/B12
  dependente do padrão** com status `ok / atenção / crítico`.
- **Custo por grama de proteína** e lista de compras semanal — evidência boa que custa R$ 900/mês não é plano, é
  hobby.
- **RIR declarado** em cada série e XP **só** para série válida; carga sem RIR é chute.
- **Diagramas de execução desenhados por código** (`data/poses.json`): esqueleto de 7 pontos + barra, interpolação
  “pingue-pongue”, sem foto de banco de imagem e sem licença cara.
- **Modo gentil** para quem marca histórico de TCA: sem contagem diária de calorias, pesagem opcional,
  comida avisada no máximo 3×/dia, foto nunca obrigatória (reforçado por `bloqueios` no cálculo de risco).
- **Motor de lembretes com backoff** (6 → 10 → 15 min) que para **só** quando você responde OK / “fiz menor” / adiar,
  com bip WebAudio gerado na hora, vibração e `Notification` com `requireInteraction`.
- **Wake Lock API** para o treino não apagar a tela, **PWA instalável** com service worker e cache de 24 h da literatura.
- **Carga aguda:crônica** (janela 0,8–1,3, Claudino 2020) e **volume por grupo muscular** com mapa de calor.
- **Clãs** por padrão alimentar (onívoros / vegetarianos / veganos / pescetarianos) e **emblemas** por constância, não
  por estética.
- **Filtro de viés automático** na busca ao vivo: financiamento em trade body → artigo marcado em vermelho e
  rebaixado a “contexto”, nunca a “base de recomendação”.
- **Exportar/importar JSON** e “zerar diário mantendo perfil”.

## Arquitetura

```
data/                     base estática versionada (é isto que o app “baixa” e usa offline)
  sources/*.json          84 fontes: t,a,j,y,doi,pmid,link,d,p,f,u,e(GRADE),cf(conflito),g(risco),no(ressalva),tg,ck
  nutrients.json          recomendações por dieta/peso/idade, perfil_risco, exames_sugeridos, suplementos A–E
  foods.json              121 alimentos (array de 15 campos) com ferro, cálcio, sódio, zinco, leucina e flags de dieta
  meals.json              modelos de refeição por dieta, papéis (âncora proteica etc.), tabela de troca, custo de rótulo
  exercises.json          67 exercícios: cues, erros, ROM, regressões/progressões, equip, nível, RIR, pose
  poses.json              22 clipes de esqueleto 2D (7 pontos + 4 pontos de braço + barra) para a animação
  program.json            níveis, XP (regras_xp_num), programas/sessões, chefes, add-on cardio, quests, emblemas, clãs
  audits.json             método de seleção, riscos comerciais, 8 casos, táticas, listas de filtro, mitos, módulos extras

src/lib/
  calc.ts        física do cálculo: TMB (Mifflin/WHO), gasto, alvo energético, macros, água, micro, riscos,
                 níveis, streak, multiplicador, carga aguda:crônica, 1RM, volume, risco vitalício
  planner.ts     solver determinístico do cardápio (âncora proteica → fibra → micronutrientes → amortecedor calórico)
  yaya.ts        tokenização PT-BR + BM25 + personalização com os seus números + política de “não sei”
  bias.ts        listas de financiadores, classificar(), peso por desenho (puro, testável em Node)
  lit.ts         busca ao vivo OpenAlex → Crossref (via /api/lit ou direto), normalização, cache de 24 h
  scheduler.ts   agenda do dia, eventos vencidos, backoff, cobrança por tipo de evento, XP por regra
  db.ts          agregador do JSON, normalização de alimentos, estado em localStorage, sync com /api, projeção pública

src/components/  ui.tsx (design system: Card/Chip/Seg/Bar/Ring/Stat/Modal/SourceCard/Spark/Heat/Toggle)
                 Figure.tsx (ExerciseFigure, BodyHeat, AlinhamentoPlancha, RomBarra)
src/views/       Onboarding, Dashboard, Nutricao, Treino, Ciencia, Yaya, Comunidade, Evolucao, Config
server/index.js  API: auth (scrypt + HMAC), /state, /feed, /posts, /leaderboard, /users, /media, /lit (proxy de
                 busca) em node:sqlite — zero dependência de terceiros. Serve dist/ quando existir.
scripts/         dev.mjs (web+api com tolerância a porta ocupada), start-server.mjs (build-then-serve para
                 Render/Fly), validate-data.mjs, smoke.mjs
render.yaml      blueprint do Render (1 serviço: site + API, health check, Node 22, SF_SECRET gerado)
```

**Regra de ouro do projeto:** os JSONs de `data/` só são importados em `src/lib/db.ts` e `src/lib/lit.ts`. Toda view
lê pelo agregador `DB`. Assim o contrato dos dados fica num lugar só e o `scripts/validate-data.mjs` consegue
garantir referencia cruzada (nenhum `refs` aponta para id inexistente, nenhum modelo de refeição aponta para alimento
inexistente, nenhuma sessão aponta para exercício inexistente).

## O critério científico (resumo)

1. Desfecho duro acima de marcador: mortalidade, evento cardiovascular, fratura, HbA1c, % de gordura — não
   “citocina caiu”.
2. Prioridade a revisão sistemática / meta / meta de rede / umbrella e a documentos de órgãos **sem** patrocínio
   comercial (OMS, NIH/IOM, EFSA, AHA, WCRF/AICR), lendo a declaração de conflito.
3. Todo item tem quatro campos de auditoria: **funding**, **conflito dos autores**, **risco comercial** e **ressalva**.
4. Se o financiador está na lista de bloqueio (Coca-Cola, PepsiCo, Nestlé, ADM/BRF/JBS, DSM, ILSI, NIZO, BSN,
   Abbott Nutrition…), o artigo **não vira recomendação**; vira contexto marcado.
5. Carne, laticínio e “plant-based” são cobertos **com a mesma lupa**: o filtro pega tanto o estudo da bebida adoçada
   pago pela marca quanto o ensaio de “dieta vegetal cura tudo” pago por fundo de advocacy.
6. `ck:0` = não conferido na fonte → a UI mostra **“verificar na fonte”** e a Yayá repete o aviso.
7. Amostra de direção contrária ao interesse declarado vale mais que dez coevos: por isso as posições da ISSN
   aparecem com o conflito na cara, e por isso a posição da AND de 2016 continua na base mesmo com a captura
   corporativa documentada — com a ressalva escrita.

Detalhes, casos e limitações: [`docs/metodologia-auditoria.md`](docs/metodologia-auditoria.md).

## Dados e privacidade

- Perfil, diários, sessões e exames ficam em `localStorage` do seu navegador (`sf_estado_v1`). Nada de corpo vai
  para o servidor, exceto o que a projeção pública permite: `nome/handle/bio/dieta/objetivo/nível/XP/streak/clã/
  emblemas/dias ativos`.
- Peso, circunferências, % de gordura, exames e fotos de progresso **nunca** entram no feed nem no ranking.
- Foto de execução é opcional em todos os fluxos e não destrava nada.
- Sem e-mail obrigatório, sem telemetria, sem anúncio, sem patrocinador — o repositório não tem chave de terceiros.
- A busca ao vivo sai do **seu** navegador para OpenAlex/Crossref; quando o servidor está no ar, a mesma chamada passa
  por `/api/lit` e é cacheada 24 h (para funcionar offline depois).

## Hospedar no Render (o caminho curto)

O app foi escrito para caber em **um único serviço**: o mesmo processo serve o `dist/` e a API
(`/api/*`, `/media/*`), e o front só usa caminho relativo — nada de `http://localhost` no código do
navegador (se você separar site e API em dois serviços, defina `VITE_API_BASE` no build).

### Opção A — Blueprint (recomendado, 3 cliques)

1. Suba este repositório no GitHub e **mergeie** a branch (o `render.yaml` aponta para `main`; se quiser
   testar antes, troque `branch:` para o seu branch).
2. No Render: **New + → Blueprint → escolha o repo**. Ele lê `render.yaml` e mostra o serviço pronto
   (`smartfit-science`, Node 22, free, region ohio).
3. **Create Blueprint**. Fim. O endereço vem como `https://smartfit-science.onrender.com`.

O que o blueprint já configura por você:

| Campo | Valor |
| --- | --- |
| Build | `npm ci && npm run build` |
| Start | `node scripts/start-server.mjs` (esse script **refaz o build se `dist/` sumiu** e liga a API com `--serve-static`) |
| Health check | `/api/health` |
| Node | `NODE_VERSION=22` (a API usa `node:sqlite`, que exige **≥ 22.5**) |
| Segredo dos tokens | `SF_SECRET` gerado pelo Render (`generateValue`) — sem ele, todo redeploy invalida os logins |
| HTTPS / domínio | automáticos |

### Opção B — criar à mão (se não quiser usar o YAML)

**New + → Web Service** (não use "Static Site" para isto, senão a API fica de fora):

- Runtime: **Node**, region: a mais perto de você (Ohio/Virginia), instance: **Free**
- Build command: `npm ci && npm run build`
- Start command: `node scripts/start-server.mjs`
- Environment: `NODE_VERSION = 22`, `NODE_ENV = production`, `SF_SECRET = <string aleatória longa>`
- Health check path: `/api/health`

### O que funciona de cara e o que o plano free limita

- **Funciona 100%**: onboarding, metas, as 6 abas de dieta, gerador de cardápio, treino por níveis com
  XP/emblemas, Yayá, auditoria, evolution, PWA instalável. **Tudo que é seu mora no `localStorage` do
  navegador**, então o servidor não guarda peso, medidas, exames nem diário — o que também significa que
  trocar de aparelho/clear nos dados exige o exportar/importar da aba Evolução.
- **Spin-down**: no plano free o serviço dorme após ~15 min sem tráfego; a primeira visita custa ~30 s
  de cold start. Se incomodar, mude para **Starter** (USD 7/mês) — sem código para isso.
- **Disco efêmero**: no free, `SF_DATA_DIR` não existe; o SQLite (feed, usuários, fotos) é recriado com o
  seed de 12 perfis a cada redeploy/restart. Para persistir de verdade: plano pago + **Disk** montado em
  `/var/data` e as env vars `SF_DATA_DIR=/var/data` e `SF_UPLOAD_DIR=/var/data/uploads` (o servidor já
  respeita as duas; sem elas o log de boot diz `cache: efêmero (re-seed no boot)`).
- **Busca ao vivo** (OpenAlex/Crossref) funciona no navegador do usuário; o proxy `/api/lit` no servidor só
  responde se o Render tiver saída de rede para as APIs públicas (tem, por padrão).

### Depois do deploy, conferir em 20 segundos

```bash
curl https://SEU-DOMINIO.onrender.com/api/health      # → {"ok":true,...,"users":12}
curl -I https://SEU-DOMINIO.onrender.com/              # → 200, cache-control: no-cache
```

Abra o site, faça o onboarding, registre uma sessão de treino e publique um post — se o post aparecer no
feed, a API + SQLite + auth estão de pé. Se aparecer `⚠ API fora` no topo, olhe os logs
(**Logs**) e confira se o Node está em 22+ (`NODE_VERSION`).

### Atualizar

`git push` no branch configurado → o Render redeploya sozinho (`autoDeploy: true`). Para validar antes de
subir: `npm run check && npm run build`.

## Testes

```
tests/calc.test.ts       18  # energia, macros, água, gestante/renal override, níveis, streak, ROM, risco vitalício
tests/planner.test.ts     6  # solver fecha proteína/fibra/cálcio, respeita flags de dieta, custo coerente
tests/yaya.test.ts        7  # retrieves certo, responde com ref, “não sei” quando não tem base, brl() formatado
tests/bias.test.ts        7  # bloqueio/observação/publico, fronteira de palavra para siglas, peso de desenho
tests/scheduler.test.ts   6  # eventos do dia, backoff, teto de insistência, janela silenciosa, XP por regra
tests/dados.test.ts       6  # integridade da base (usa o validador), cobertura, cápsulas, ck/honestidade, README
```
