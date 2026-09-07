import { renderToString } from 'react-dom/server';
import { createElement } from 'react';

const hoje = new Date();
const key = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
const perfil = {
  nome: 'Teste Silva', handle: 'teste', sexo: 'm', nascimento: '1992-05-10', alturaCm: 178, pesoKg: 84,
  cinturaCm: 96, pescocoCm: 38, quadrilCm: 102, atividade: 2, objetivo: 'perder_gordura', treinoDias: 4,
  dieta: 'lacto_ovo', restricoes: [], evitar: [], refeicoesDia: 4, acorda: '07:00', dormir: '23:00',
  condicoes: [], nivelInicial: 2, equip: ['casa', 'halter'], experiencia: 'intermediario', exames: { ferritina: 22 },
  programaId: 'casa_inicial', chefesFeitos: [], comunidade: { privado: false }, __adiamentos: {},
};
const estado = {
  perfil, metas: null, dias: { [key]: { agua: 5, copos: [], refeicoes: { 'Café da manhã': { itens: [] } }, treino: { ok: true, sessaoId: 'A' }, sonoH: 7.2, pesoKg: 84, passos: 8100, humor: 4, stress: 2, checkins: [], fotos: [], kcal: 1850, prot: 120, fibra: 22, mindfulnessMin: 5, notas: '', quests: { q_agua: true } } },
  xpLog: [{ data: new Date().toISOString(), dia: key, motivo: 'serie_concluida', valor: 40 }],
  sessoes: [{ id: 'x', data: key, programa: 'casa_inicial', sessaoId: 'A', exercicios: [{ ex: 'squat_goblet', séries: [{ carga: 24, reps: 12, rir: 2, ok: true }, { carga: 24, reps: 11, rir: 1, ok: true }], alvo: 3 }], cargaTotal: 552 }],
  alertasFeitos: { [key]: ['agua-1'] }, preferencias: { som: false, vibrar: false, notificacoes: false },
  posts: [{ id: 'p1', texto: 'bloco 1 ok', tipo: 'treino', data: new Date().toISOString(), reacoes: 2 }],
  badges: ['b_hydra'], flags: [], seguindo: [], exames: [], fotoPerfil: null,
};
const store: Record<string, string> = { sf_estado_v1: JSON.stringify(estado) };
(globalThis as any).localStorage = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
};
(globalThis as any).window = {
  innerWidth: 1200, innerHeight: 900, scrollY: 0,
  addEventListener() {}, removeEventListener() {}, scrollTo() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
};
Object.defineProperty(globalThis as any, 'navigator', { value: { onLine: true, vibrate: () => {}, mediaDevices: undefined }, configurable: true, writable: true });
(globalThis as any).fetch = async () => ({ ok: false, status: 500, text: async () => '', json: async () => ({}) });
(globalThis as any).Notification = class { static permission = 'default'; static async requestPermission() { return 'default'; } };
(globalThis as any).AudioContext = undefined;
(globalThis as any).document = { getElementById: () => ({}) };

const abas = ['hoje', 'nutricao', 'treino', 'ciencia', 'yaya', ' tribo', 'evolucao', 'config'];
const warnings: string[] = [];
const origWarn = console.error;
console.error = (...a: any[]) => { warnings.push(a.map(String).join(' ')); };

const { default: App } = await import('../src/App.tsx');
for (const aba of abas) {
  store.sf_aba = aba;
  try {
    const html = renderToString(createElement(App));
    const len = html.length;
    if (len < 900) { origWarn(`FAIL-curto ${JSON.stringify(aba)}: ${len} bytes`); } else { origWarn(`ok ${JSON.stringify(aba)}: ${len} bytes`); }
  } catch (err: any) {
    origWarn(`ERRO ${JSON.stringify(aba)}: ${err?.message}\n${String(err?.stack).split('\n').slice(1, 4).join('\n')}`);
  }
}
// onboarding (sem perfil)
delete store.sf_estado_v1;
try { const h = renderToString(createElement(App)); origWarn(`ok onboarding: ${h.length} bytes`); } catch (e: any) { origWarn('ERRO onboarding: ' + e.message); }
console.error = origWarn;
const reais = warnings.filter((w) => !/useLayoutEffect|hydrat|not supported in the server|renderToString/.test(w));
origWarn('--- warnings relevantes:', reais.length ? reais.slice(0, 12).join('\n') : 'nenhum');
