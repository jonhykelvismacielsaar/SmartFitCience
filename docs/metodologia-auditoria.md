# Metodologia de auditoria de viés — SmartFit Science

> Como este app escolheu as fontes que sustentam cada recomendação, o que ele **recusa**, o que ele **aceita com
> ressalva** e onde ele **pode estar errado**. Leia isto antes de seguir qualquer número daqui.

---

## 1. O problema que a auditoria resolve

Nutrição e exercício são as duas áreas onde a indústria mais compra credibilidade. O mecanismo raramente é
fraude: é **seleção de desfecho, desenho generoso, dose alta de produto no braço experimental, contraste escolhido a
dedo, publicação de marcador substituto e ausência de acompanhamento longo**. Somado a isso, há o financiamento —
que move a *pergunta* feita, mais do que o resultado medido.

Um app que prescreve (dieta, carga, suplemento) precisa, portanto, de um filtro anterior ao conteúdo: **quem pagou,
que desfecho foi medido e por quanto tempo, e se alguém independente replicou**.

## 2. Os sete critérios (aplicados a todos os 84 itens da base)

1. **Desfecho duro > marcador substituto.** Aceito como base de recomendação: mortalidade, evento cardiovascular,
   câncer, fratura, incidência de diabetes, HbA1c, % de gordura corporal medida, força medida, adesão medida.
   Marcador isolado (LDL, citocina, “inflamação”, microbiota, espessura cortical) vira nota de rodapé com grau D/E.
2. **Hierarquia de desenho.** Umbrella review > meta-análise > revisão sistemática > ECA grande e multicêntrico >
   coorte prospectiva > ECA pequeno/cruzado > mecânico/piloto > editorial/posição. O app carrega isso em
   `listas_filtro.tipos_desenho_peso`.
3. **Origem do dinheiro.** `cf` (conflito) é campo obrigatório em todo item. Se o financiador aparece na lista de
   bloqueio, o item sai de “base de recomendação” e vira “contexto” (a UI mostra em vermelho, com o motivo).
4. **Independência do comitê.** Para diretrizes, checar se o comitê declarou ausência de vínculo. Exemplo positivo
   usado no app: a declaração da **AHA 2021 sobre gorduras e lipídios** (*Circulation* 143:e565-e607) saiu de comitê
   sem financiamento e sem vínculo com indústria de alimentos — é por isso que ela aparece como base da meta de
   gordura saturada, e não por ser “de uma associação de cardiologia”.
5. **Replicação independente.** Recomendação precisa de ≥1 síntese independente do financiador. Sem réplica, o item
   é aceito como “atenção/monitorar”, nunca como ordem.
6. **Direção do interesse.** O filtro é simétrico: vale para Nestlé e para fundo de *advocacy* vegano, para marca de
   bebida adoçada e para marca de proteína em pó, para laticínio e para “suplemento vegetal de carne”. Nada aqui é
   “anti-indústria de carne” ou “pró-plant-based” — é anti-estudo-pago-por-quem-vende.
7. **Audácia proporcional à prova.** Nível de recomendação (verde/amarelo/vermelho no app) é função de 1–6, não da
   minha preferência. Onde a prova é fraca, o app **diz que é fraca** (campo `no`, “ressalva honesta”).

## 3. O que `ck` significa (e por que a UI tem o selo “verificar na fonte”)

Cada fonte carrega `ck`:

- `ck: 1` — bibliografia conferida contra o registro público (título, ano, revista, DOI resolvendo).
- `ck: 0` — **não** conferida caractere a caractere no momento da montagem da base (build sem rede).

Isso não é decoração: **o app é obrigado a mostrar `ck:0`**. `SourceCard`, ficha da fonte, Yaya e avisos do dashboard
repetem “verificar na fonte”. Um número com selo `ck:0` serve para você entender a direção da evidência; **não** para
você citar em consulta, prescrever dose de suplemento com base nele, ou discutir com seu médico sem antes abrir o
trabalho. Se você conferir e o número bater, atualize `ck` para `1` no JSON — a mudança é trivial e o repositório é
seu.

Política de erro: **nunca inventar DOI, PMID, ano ou volume**. Se a referência não pode ser confirmada, o campo fica
vazio e a ressalva é escrita por extenso. Vários casos abaixo são citados **sem DOI por esse motivo** — a fonte é
cobertura jornalística e editorial de revista, que é o que existe publicamente, e fingir precisão seria pior.

## 4. Listas de filtro

Em `data/audits.json` → `listas_filtro`:

- **`bloqueio_recomendacao`** (65+ nomes) — fabricantes e *trade bodies* de alimento, bebida, proteína, ingrediente
  e suplemento. Presença em `funding` ⇒ o artigo não fundamenta recomendação. Estão lá, entre outros: Coca-Cola,
  PepsiCo, Keurig Dr Pepper, Nestlé, Mondelez, Kraft Heinz, General Mills, Kellogg, Conagra, Tyson Foods, Cargill,
  ADM/Archer Daniels Midland, Bunge, BRF, JBS, Marfrig, Minerva, Searle, Abbott Nutrition e Abbott Laboratories,
  Nutricia, Danone, Fonterra, Arla, FrieslandCampina, NIZO, Wageningen Food, Ajinomoto, DSM, BASF, Givaudan, IFF,
  Kerry Group, Ingredion, Tate & Lyle, Sugar Association, ILSI/International Life Sciences Institute, Global Beef,
  National Cattlemen's Beef Association, North American Meat Institute, Meat Institute, National Pork Board,
  USA Poultry, National Dairy Council, Dairy Management, Institute of Food Technologists.
- **`sinalizacao_observacao`** — não invalida por si, mas exige corroboração independente e aparece como aviso:
  Dairy Council of California, Eggs Nutrition Center, Food Industry Association, American Beverage Association,
  Snack Foods, GSSI, Nutricia Research, “Fundação/Instituto de marca de suplemento”.
- **`preferencia_publicos`** — aumentam a confiança na isenção comercial (não substituem a leitura do desenho): NIH
  (inclusive intramural), NCI, NIDDK, Wellcome, MRC, UKRI, DFG, NWO, Flanders, CIHR, Heart & Stroke / Heart
  Foundation, Cancer Research UK, WCRF/AICR, AHA institucional, Comissão Europeia/Horizon, Ministério da Saúde /
  SUS, FAPESP/CNPq/CAPES, Gates, Robert Wood Johnson.
- **`desenhos_boas_praticas`** — meta-análise, revisão sistemática, umbrella, overview, PRISMA, protocolo registrado,
  meta de dados individuais: dão peso extra no ranking interno de qualidade.

Implementação: `src/lib/bias.ts` (`batePadrao`). Siglas de até 5 caracteres (DSM, NIH, ADM, BRF, JBS, IFF, ILSI,
NIZO, BSN) só casam por **fronteira de palavra** e só no campo de funding — casar por substring produziria falso
positivo em texto comum; casar por fronteira no título quebraria “coca cola”. A escolha é documentada no código.

## 5. Casos que a base usa como “vacina” (e o que o app faz com cada um)

Todos já documentados publicamente; o app os mantém visíveis em `audits.casos` para o usuário ler *por que* desconfia.

| Caso | O que há de público | O que o app faz |
| --- | --- | --- |
| **Global Energy Balance Network** (Coca-Cola) | Rede de pesquisadores montada e financiada pela Coca-Cola para promover “equilíbrio energético” e deslocar o debate do açúcar para “falta de exercício”; ruiu quando a origem do dinheiro virou notícia (reportagem AP, 2015/2016 e editoriais de revista). | Toda recomendação sobre **açúcar e bebida adoçada** vem de coorte/meta **sem** funding de bebida, e o app avisa que “equilíbrio energético” como desculpa para não mexer no açúcar é argumento de fabricante. |
| **ILSI** | Instituto criado por indústria de alimentos, usado como “terceiro independente” em revisões sobre edulcorantes, óleo de palma e bebidas; várias análises mostram alinhamento do desfecho com o interesse doador. | ILSI está em `bloqueio`. Revisões “independentes” que só existem via ILSI aparecem como contexto, não como base. |
| **Position stands da ISSN** (JISSN, revisão de conflitos 2018; PMC6090881 / PMID 30068354) | Os próprios autores declaram grants, consultorias, royalties e ações de empresas de suplemento/proteína; um autor era *Chief Science Officer* da Dymatize. O texto da revisão diz, corretamente, que declarar COI não descredibiliza por si. | O app **cita** os position stands de creatina/proteína/cafeína (porque são as sínteses mais completas disponíveis sobre *aqueles* tópicos) **sempre com a linha de conflito na cara** e cruzando com meta independente — e nunca usa ISSN para recomendar **marca** ou produto, nem para dose “máxima tolerada”. |
| **Academy of Nutrition and Dietetics — captura corporativa** | Análise em *Public Health Nutrition* (2022–2023, projeto US Right to Know) cruzando declarações de impostos (IRS 990 Sch. B) e FOIA: mais de US$ 15 milhões de doadores corporativos, incluindo National Dairy Council (~US$ 1,5 mi), Conagra (~US$ 1,41 mi), Abbott (~US$ 1,25 mi), PepsiCo (~US$ 486 mil), além de Coca-Cola, Hershey, General Mills e Kraft; participação em EXPO com palestrantes de indústria; ações de Nestlé/PepsiCo no portfólio da própria fundação. A AND respondeu: <3% dos investimentos em *food companies*, nenhuma posição alterada por patrocinador, parceria com a Kraft encerrada em 2015. | Nuance obrigatória, e o app a escreve na tela: isso **não** invalida a posição de 2016 sobre dietas vegetarianas — que é coerente com revisões independentes e com o corpo de evidência — mas explica por que a AND **não** é usada como autoridade para laticínio, carne ou suplemento. Diretriz de órgão vale para o que é consenso externo, não para o que é interesse interno do doador. |
| **Meta-análises de ultraprocessados (BMJ 2024/2025, Lane et al.)** | Os próprios autores registram: nenhuma meta-análise incluída foi financiada por empresa de ultraprocessado; críticos rebaixaram a certeza no GRADE; e o NOVA não distingue pão integral de refrigerante — limitação de classificação, não de funding. | O app usa ultraprocessados como “atenção” com a ressalva do NOVA, em vez de transformá-lo em vilão causal provado. É o exemplo de **honestidade contra a própria narrativa**. |
| **Estudo de “dieta vegetariana → depressão”** (análises populacionais/MR que correram a imprensa) | Existe literatura, mas os instrumentos de exposição e os resíduos de causalidade reversa são fracos; a inferência causal não se sustenta. | O app **não** afirma que dieta vegetal cause depressão nem o contrário; responde com o desenho fraco, cita a busca no PubMed (sem DOI) e manda para profissional de saúde se o humor for o problema real. |
| **“Calorias líquidas”/chás termogênicos/“detox”** | Marketing usa pequenos ECA de marcador + ausência de desfecho duro. | Bloqueado por regra 1 (desfecho), e aparece em `mitos` com a explicação do mecanismo de venda. |

## 6. Como a auditoria chega na interface

| Lugar | O que o usuário vê |
| --- | --- |
| Card de fonte (Ciência) | grau GRADE (A–E), desenho, população, `cf` como “Conflito de interesse”, `no` como “Ressalva honesta”, risco de viés (`g`) em verde/âmbar/vermelho, selo “conferir nº/DOI” quando `ck:0`. |
| Cada recomendação do plano | rodapé com o id da fonte; clique abre a ficha completa com a linha de funding. |
| Yayá | só responde com corpo + `refs`; se o índice não tem correspondência suficiente, a resposta é “não encontrei base para isso” (nunca palpite); a linha de conflito das fontes citadas vai junto. |
| Busca ao vivo | classificação de risco (`baixo/moderado/alto`) calculada no navegador a partir de `funders` do OpenAlex, com o motivo; “excluir artigos com funding setorial” é um interruptor, não um filtro escondido. |
| Nutrição | o painel “riscos & lacunas” diz o que é *falta do padrão* (B12, cálcio, ferro, ômega-3, creatina em vegetarianos) com fonte de órgão público — e não com fonte de vendedor de suplemento. |

## 7. Limites honestos deste método

1. **Ausência de conflito não prova verdade.** Prova isso: muitos ECA “limpos” não replicam; a base por isso exige réplica.
2. **Funding nem sempre muda o resultado** — muda a pergunta, a dose, o comparador e o que é publicado. Tratar
   funding como veneno universal seria tão enviesado quanto ignorá-lo. O app **marca e contextualiza**, não apaga.
3. **GRADE aqui é artesanal.** Os graus A–E foram atribuídos por leitura dos resumos/registros, não por dois avaliadores
   independentes com instrumento formal. Há itens onde o certo seria descer um grau.
4. **Amostragem tem viés de disponibilidade:** a base privilegia o que é aberto e indexável (PMC, DOI resolvido), o que
   super-representa nutrição esportiva americana/europeia e sub-representa ensaios de países de renda média — onde a
   comida barata que você come é outra. Por isso o custo da cesta entra na equação (dados de preço são estimados e o
   app diz que são estimados).
5. **Cálculos são estimativas populacionais.** TMB ±10%, gasto com fator de atividade ±15–20 %, composição corporal
   ±3–4 pontos percentuais. O que manda é a tendência de 3 semanas, não o número do dia.
6. **A base é estática.** A busca ao vivo cobre o que saiu depois, mas nada substitui um nutricionista/médico que
   acompanha você por meses.

## 8. Protocolo de conferência (como subir `ck` de 0 para 1)

1. Abra o link da fonte (`doi.org/...` ou PubMed).
2. Confira **título, ano, revista, volume/número/páginas** caractere a caractere; o campo `ck` cobre a bibliografia,
   não a conclusão.
3. Localize `Funding` e `Conflicts of Interest` (às vezes em material suplementar) e atualize `cf`.
4. Se o desfecho principal for marcador substituto, baixe o grau para D/C e ajuste o campo `u` (“como o app usa”).
5. Rode `npm run validate && npx tsc --noEmit && node --test tests/*.test.ts` — o `tests/dados.test.ts` garante que
   nenhum `ck:0` ficou sem nota e que o README continua declarando a limitação.

## 9. Independência

Nenhum item da base foi escolhido para defender marca, suplemento, aplicativo concorrente, dieta da moda ou
ideologia. Não há patrocínio, link de afiliado, SDK de anúncio, pixel ou venda de dado. O repositório é verificável:
`data/*.json` é texto puro, e o filtro está em `src/lib/bias.ts` com testes em `tests/bias.test.ts` — você pode
discordar das listas e editá-las, e o app continua funcionando.
