#!/usr/bin/env node
// Validador da base de dados: ids únicos, referências cruzadas resolvidas, tipos coerentes.
// Roda em `npm run validate` e dentro de tests/data.test.ts (node --test).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const R = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (p) => JSON.parse(readFileSync(join(R, p), 'utf8'));
const erros = [];
const aviso = (m) => erros.push(m);

const FOOD_CAMPOS = ['id', 'nome', 'grupo', 'porcao', 'kcal', 'prot', 'carb', 'gord', 'fibra', 'ferro', 'calcio', 'sodio', 'zinco', 'leucina', 'flags'];

const nut = ler('data/sources/nutrition.json'), tra = ler('data/sources/training.json'), lif = ler('data/sources/lifestyle.json');
const fontes = [...(nut.fontes || []), ...(tra.fontes || []), ...(lif.fontes || [])];
const idsFonte = new Set(fontes.map((f) => f.id));
const dup = fontes.map((f) => f.id).filter((x, i, a) => a.indexOf(x) !== i);
if (dup.length) aviso(`ids de fonte duplicados: ${dup.join(', ')}`);
for (const f of fontes) {
  for (const campo of ['t', 'y']) if (f[campo] == null) aviso(`fonte ${f.id} sem ${campo}`);
  if (!f.doi && !f.pmid && !f.link) aviso(`fonte ${f.id}: sem localizador (doi/pmid/link)`);
  if (f.ck === 0 && !String(f.no || '').length) aviso(`fonte ${f.id} com ck:0 e sem nota de verificação`);
  if (typeof f.y === 'string' && !/^\d{4}$/.test(f.y)) aviso(`fonte ${f.id}: ano não numérico (${f.y})`);
}

const foods = ler('data/foods.json');
const idsFood = new Set();
foods.alimentos.forEach((a, i) => {
  if (!Array.isArray(a)) { aviso(`foods.alimentos[${i}] não é vetor`); return; }
  if (a.length !== FOOD_CAMPOS.length) aviso(`foods ${a[0]} tem ${a.length} campos, esperado ${FOOD_CAMPOS.length}`);
  if (idsFood.has(a[0])) aviso(`alimento duplicado: ${a[0]}`);
  idsFood.add(a[0]);
  for (const c of a.slice(3, 14)) if (typeof c !== 'number' || Number.isNaN(c) || c < 0) aviso(`alimento ${a[0]}: valor numérico inválido (${c})`);
  if (!/^[vlop a]+$/.test(a[14])) aviso(`alimento ${a[0]}: flags estranhas (${a[14]})`);
});
const gruposArr = Array.isArray(foods.grupos) ? foods.grupos.map((g) => g.id || g[0]) : Object.keys(foods.grupos || {});
for (const g of gruposArr) if (!foods.alimentos.some((a) => a[2] === g)) aviso(`grupo sem alimento: ${g}`);

const ex = ler('data/exercises.json');
const idsEx = new Set(ex.exercicios.map((e) => e.id));
for (const e of ex.exercicios) {
  if (ex.exercicios.filter((x) => x.id === e.id).length > 1) aviso(`exercício duplicado: ${e.id}`);
  if (!e.n || !e.pose || !e.grp) aviso(`exercício ${e.id} incompleto`);
  if (!(e.nivel >= 0 && e.nivel <= 3)) aviso(`exercício ${e.id}: nivel inválido (${e.nivel})`);
  if (!(e.xpBase > 0)) aviso(`exercício ${e.id}: xpBase inválido`);
  for (const s of e.sub || []) if (!idsEx.has(s)) aviso(`exercício ${e.id}: sub órfã "${s}"`);
  for (const k of ['regressoes', 'progressoes']) for (const s of e[k] || []) if (typeof s === 'string' && s.includes(' ') === false && idsEx.size && !idsEx.has(s) && !/^[a-zà-ú]/.test(s)) aviso(`${e.id}.${k}: "${s}"`);
}
const poses = ler('data/poses.json').poses;
for (const e of ex.exercicios) if (!poses[e.pose]) aviso(`exercício ${e.id}: pose "${e.pose}" não existe em poses.json`);
for (const [k, v] of Object.entries(poses)) {
  if (!['l', 'f'].includes(v.v)) aviso(`pose ${k}: vista inválida`);
  (v.frames || []).forEach((fr, i) => { if ((fr.p || []).length !== 7) aviso(`pose ${k} quadro ${i}: ${fr.p?.length} pontos (esperado 7)`); });
  if (!v.dur) aviso(`pose ${k}: sem duração`);
}

const prog = ler('data/program.json');
const programas = Array.isArray(prog.programas) ? prog.programas : Object.values(prog.programas || {});
for (const p of programas) {
  const nome = p.id || p.nome || '?';
  for (const s of p.sessoes || []) for (const it of s.exercicios || []) {
    if (!idsEx.has(it.ex)) aviso(`programa ${nome}: exercício inexistente "${it.ex}"`);
    if (!(Number(it.series) > 0)) aviso(`programa ${nome}/${it.ex}: series inválido (${it.series})`);
    if (it.reps == null && it.tempo == null) aviso(`programa ${nome}/${it.ex}: sem reps nem tempo`);
  }
  for (const it of p.sessoes || []) void it;
}
if (!(prog['níveis'] || prog.niveis || []).length) aviso('program.json sem níveis');
const niveis = prog['níveis'] || prog.niveis || [];
niveis.forEach((l, i) => { if (i > 0 && l.xp <= niveis[i - 1].xp) aviso(`níveis não crescentes em n=${l.n}`); });
const quests = Array.isArray(prog.quests) ? prog.quests : Object.values(prog.quests || {}).flat();
for (const q of quests) if (!q.nome) aviso(`quest malformada: ${JSON.stringify(q).slice(0, 40)}`);
if (!quests.length) aviso('program.json sem quests');

const nut2 = ler('data/nutrients.json');
for (const r of nut2.recomendacoes || []) for (const b of r.base || []) if (!idsFonte.has(b)) aviso(`nutrientes.${r.id}: base órfã "${b}"`);
for (const s of nut2.suplementos || []) {
  for (const b of s.base || []) if (!idsFonte.has(b)) aviso(`suplemento ${s.id}: base órfã "${b}"`);
  if (!/^[A-E]\b/.test(String(s.prioridade || ''))) aviso(`suplemento ${s.id}: prioridade sem letra A-E (${s.prioridade})`);
  if (!s.base || !s.base.length) aviso(`suplemento ${s.id}: sem base`);
}
for (const e of nut2.exames_sugeridos || []) if (!e.nome || !e.porque) aviso('exame sugerido malformado');

const meals = ler('data/meals.json');
for (const [dieta, ms] of Object.entries(meals.modelos || {})) for (const m of ms) {
  for (const it of m.itens) if (!idsFood.has(it.a)) aviso(`meals ${dieta}/${m.nome}: alimento inexistente "${it.a}"`);
  for (const r of m.refs || []) if (!idsFonte.has(r)) aviso(`meals ${dieta}/${m.nome}: ref inexistente "${r}"`);
  if (!m.itens.length) aviso(`meals ${dieta}/${m.nome}: sem itens`);
}
for (const g of meals.substituicoes || []) for (const b of g.blocos) {
  for (const por of b.por || []) if (!idsFood.has(por.a)) aviso(`substituição "${b.de}" → alimento inexistente "${por.a}"`);
  const de = String(b.de || '').split(' ')[0]; if (!idsFood.has(de)) aviso(`substituição: "de" não é id de alimento (${de})`);
}
for (const p of meals.papeis || []) for (const b of p.base || []) if (!idsFonte.has(b)) aviso(`meals.papeis.${p.papel}: base órfã "${b}"`);

const faq = ler('data/faq.json');
const idsCaps = new Set();
for (const c of faq.capsulas || []) {
  if (idsCaps.has(c.id)) aviso(`cápsula duplicada: ${c.id}`); idsCaps.add(c.id);
  if (!(c.q || []).length || !c.a || !c.a.length) aviso(`cápsula ${c.id}: sem pergunta ou resposta`);
  if (/\?\?|\{\{|\}\}|undefined|\bNaN\b|TODO|FIXME|  /.test(c.a)) aviso(`cápsula ${c.id}: texto com resíduo suspeito`);
  if (!/[.!?]\s*$/.test(c.a.trim())) aviso(`cápsula ${c.id}: resposta não termina em pontuação`);
  for (const r of c.refs || []) if (!idsFonte.has(r)) aviso(`cápsula ${c.id}: ref inexistente "${r}"`);
}

const aud = ler('data/audits.json');
if (!aud.metodo_selecao) aviso('audits.json sem metodo_selecao');
for (const c of aud.casos || []) {
  for (const k of ['id', 'nome', 'o_que_aconteceu', 'por_que_importa', 'o_app_faz']) if (!c[k]) aviso(`caso ${c.id || '?'}: falta ${k}`);
  for (const r of c.refs || []) if (!idsFonte.has(r)) aviso(`caso ${c.id}: ref inexistente "${r}"`);
}
for (const m of aud.mitos || []) {
  if (!m.titulo || !m.realidade) aviso('mito malformado');
  for (const r of m.refs || []) if (!idsFonte.has(r)) aviso(`mito ${m.id}: ref inexistente "${r}"`);
}
for (const t of aud.taticas_comerciais || []) for (const k of ['nome', 'como', 'defesa']) if (!t[k]) aviso(`tática ${t.id}: falta ${k}`);
for (const [k, v] of Object.entries(aud.listas_filtro?.bloqueio_recomendacao?.padroes ? aud.listas_filtro : {})) void v, void k;
for (const chave of ['bloqueio_recomendacao', 'sinalizacao_observacao', 'preferencia_publicos']) {
  const l = aud.listas_filtro?.[chave];
  if (!l || !(l.padroes || []).length) aviso(`listas_filtro.${chave} sem padrões`);
}
if (!Object.keys(aud.listas_filtro?.tipos_desenho_peso || {}).length) aviso('listas_filtro.tipos_desenho_peso vazio');
for (const m of aud.modulos_extra || []) if (!m.id || !m.nome || !m.descricao) aviso('módulo extra malformado');
if (!aud.metodo_selecao?.passos?.length) aviso('metodo_selecao sem passos');
for (const d of (faq.capsulas || [])) for (const r of d.refs || []) if (!idsFonte.has(r)) { /* já checado acima */ }
if (fontes.some((f) => f.ck === 0) === false) console.log('  (aviso) nenhuma fonte marcada ck:0 — verifique se todos os DOIs são reais');

if (erros.length) { console.error(`✗ ${erros.length} problema(s):\n` + erros.map((e) => '  · ' + e).join('\n')); process.exit(1); }
console.log(`✓ base validada: ${fontes.length} fontes, ${idsFood.size} alimentos, ${idsEx.size} exercícios, ${Object.keys(poses).length} poses, ${niveis.length} níveis, ${(faq.capsulas || []).length} cápsulas, ${(aud.casos || []).length} casos de auditoria`);
