import { useEffect, useState } from 'react';
import { useApp } from '../App.tsx';
import { DB, api, fmt, hojeKey } from '../lib/db.ts';
import { ACTIVIDADE, NIVEIS_DIETA } from '../lib/calc.ts';
import { REGRAS_PADRAO } from '../lib/scheduler.ts';
import { Card, Chip, Seg, SourceCard, Stat, Toggle, useToast } from '../components/ui.tsx';

const SEXOS = ['masculino', 'feminino', 'outro'];
const DIETAS = Object.keys(NIVEIS_DIETA) as (keyof typeof NIVEIS_DIETA)[];
const TODO_EQ: string[] = [...new Set<string>(DB.exercicios.flatMap((x: any) => x.eq || []) as string[])].sort();
const TODO_RESTR = ['lactose', 'glúten', 'ovo', 'fruto do mar', 'castanha', 'soja', 'picante', 'cafeína', 'álcool', 'fritura'];
const GRUPOS = ['gestante', 'drc', 'dm2', 'hipertensao', 'dislipidemia', 'tca', 'idoso', 'tabagismo'];

export default function Config() {
  const { store, metas, irPara, flutuar } = useApp();
  const e = store.estado;
  const p = e.perfil;
  const prefs = { ...REGRAS_PADRAO, ...(e.preferencias || {}) };
  const [form, setForm] = useState<any>({ ...(p || {}) });
  const [login, setLogin] = useState({ handle: '', senha: '', email: '' });
  const [permissao, setPermissao] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'inexistente');
  const [instalavel, setInstalavel] = useState<any>(null);
  const toast = useToast();

  useEffect(() => setForm({ ...store.estado.perfil }), [store.estado.perfil]);
  useEffect(() => {
    const h = (ev: Event) => { ev.preventDefault(); setInstalavel(ev); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);

  const set = (patch: any) => {
    const next = { ...form, ...patch };
    setForm(next);
    store.mutar((x) => ({ ...x, perfil: { ...x.perfil, ...patch } }));
  };
  const setPref = (patch: any) => store.mutar((x) => ({ ...x, preferencias: { ...(x.preferencias || {}), ...patch } }));
  const num = (v: string) => Number(String(v).replace(',', '.')) || 0;

  const riscos: Record<string, any> = Object.fromEntries(((DB.nutrientes?.perfil_risco || []) as any[]).map((r: any) => [String(r.perfil).toLowerCase(), r]));
  const ativos = (p.condicoes || []);

  return (
    <div className="grid g2">
      <Card title="perfil antropométrico" tone="neon" aux="toda meta é recalculada ao mudar um campo">
        <div className="grid g4">
          <div><label className="f">peso (kg)</label><input type="number" step="0.1" value={form.pesoKg ?? ''} onChange={(ev) => set({ pesoKg: num(ev.target.value) })} /></div>
          <div><label className="f">altura (cm)</label><input type="number" value={form.alturaCm ?? ''} onChange={(ev) => set({ alturaCm: num(ev.target.value) })} /></div>
          <div><label className="f">nascimento</label><input type="date" value={form.nascimento ?? ''} onChange={(ev) => set({ nascimento: ev.target.value })} /></div>
          <div><label className="f">meta de peso (kg)</label><input type="number" step="0.1" value={form.metaPeso ?? ''} onChange={(ev) => set({ metaPeso: num(ev.target.value) })} /></div>
        </div>
        <label className="f" style={{ marginTop: 8 }}>sexo (muda TMB, ferro e meta de cálcio)</label>
        <div className="chips">{SEXOS.map((s) => <Chip key={s} on={form.sexo === s} onClick={() => set({ sexo: s })}>{s}</Chip>)}</div>
        <label className="f" style={{ marginTop: 8 }}>nível de atividade</label>
        <div className="chips">{ACTIVIDADE.map((v: any) => <Chip key={v.v} on={form.atividade === v.v} onClick={() => set({ atividade: v.v })} title={v.desc}>{v.nome}</Chip>)}</div>
        <div className="grid g3" style={{ marginTop: 8 }}>
          <div><label className="f">cintura (cm)</label><input type="number" step="0.5" value={form.cinturaCm ?? ''} onChange={(ev) => set({ cinturaCm: num(ev.target.value) })} /></div>
          <div><label className="f">quadril (cm)</label><input type="number" step="0.5" value={form.quadrilCm ?? ''} onChange={(ev) => set({ quadrilCm: num(ev.target.value) })} /></div>
          <div><label className="f">pescoço (cm)</label><input type="number" step="0.5" value={form.pescocoCm ?? ''} onChange={(ev) => set({ pescocoCm: num(ev.target.value) })} /></div>
        </div>
        <label className="f" style={{ marginTop: 8 }}>clã (aparece no seu cartão público)</label>
        <div className="chips">{(DB.program.clas || []).map((c: any) => <Chip key={c.id} on={form.clan === c.id} onClick={() => set({ clan: form.clan === c.id ? null : c.id })} title={c.descricao}>{c.nome}</Chip>)}</div>
        <div className="row" style={{ marginTop: 8 }}>
          <span className="tiny">IMC atual <b className="mono">{fmt.n((p.peso || 0) / Math.pow((p.altura || 170) / 100, 2), 1)}</b> · TMB {fmt.n(metas?.tmb || 0)} kcal · gasto {fmt.n(metas?.kcal || 0)} kcal · proteína {fmt.n(metas?.prot || 0)} g</span>
          <button className="btn xs ghost right" onClick={() => irPara('onboarding')}>refazer onboarding completo</button>
        </div>
      </Card>

      <Card title="dieta, equipamentos e restrições" tone="blue">
        <label className="f">padrão alimentar (define a aba e o filtro do gerador)</label>
        <div className="chips">{DIETAS.map((d) => <Chip key={d} on={form.dieta === d} onClick={() => set({ dieta: d })} title={NIVEIS_DIETA[d].flags.join(' ')}>{NIVEIS_DIETA[d].nome}</Chip>)}</div>
        <label className="f" style={{ marginTop: 8 }}>equipamento disponível (limita os exercícios do programa)</label>
        <div className="chips">{TODO_EQ.map((q) => <Chip key={q} on={(form.equip || []).includes(q)} onClick={() => set({ equip: (form.equip || []).includes(q) ? form.equip.filter((x: string) => x !== q) : [...(form.equip || []), q] })}>{q}</Chip>)}</div>
        <label className="f" style={{ marginTop: 8 }}>não como / alergia</label>
        <div className="chips">{TODO_RESTR.map((r) => <Chip key={r} on={(form.restricoes || []).includes(r)} onClick={() => set({ restricoes: (form.restricoes || []).includes(r) ? form.restricoes.filter((x: string) => x !== r) : [...(form.restricoes || []), r] })}>{r}</Chip>)}</div>
        <label className="f" style={{ marginTop: 8 }}>evitar por escolha</label>
        <div className="chips">{['ultraprocessado', 'carne vermelha', 'fritura', 'açúcar', 'adoçante', 'álcool', 'laticínios', 'soja'].map((r) => <Chip key={r} on={(form.evitar || []).includes(r)} onClick={() => set({ evitar: (form.evitar || []).includes(r) ? form.evitar.filter((x: string) => x !== r) : [...(form.evitar || []), r] })}>{r}</Chip>)}</div>
        <div className="grid g4" style={{ marginTop: 8 }}>
          <div><label className="f">refeições/dia</label><input type="number" min={3} max={6} value={form.refeicoesDia ?? 4} onChange={(ev) => set({ refeicoesDia: num(ev.target.value) })} /></div>
          <div><label className="f">treinos/semana</label><input type="number" min={2} max={6} value={form.treinoDias ?? 3} onChange={(ev) => set({ treinoDias: num(ev.target.value) })} /></div>
          <div><label className="f">acorda (hh:mm)</label><input value={form.acorda ?? '07:00'} onChange={(ev) => set({ acorda: ev.target.value })} /></div>
          <div><label className="f">dorme (hh:mm)</label><input value={form.dormir ?? '23:00'} onChange={(ev) => set({ dormir: ev.target.value })} /></div>
        </div>
      </Card>

      <Card title="alertas: o coach que não desiste" tone="amber" aux="o evento só sai da tela quando você confirma">
        <div className="col">
          <div className="grid g2">
            <div><label className="f">backoff de adiamento (min) · vira 6 → 10 → 15</label><input type="number" value={prefs.intervaloAdiamento} onChange={(ev) => setPref({ intervaloAdiamento: num(ev.target.value) })} /></div>
            <div><label className="f">nº máximo de insistências</label><input type="number" value={prefs.maxAdiamentos} onChange={(ev) => setPref({ maxAdiamentos: num(ev.target.value) })} /></div>
          </div>
          <div className="col" style={{ gap: 4 }}>
            <Toggle checked={!!prefs.notificacoes} onChange={async (v) => {
              if (v && typeof Notification !== 'undefined') { const r = await Notification.requestPermission(); setPermissao(r); if (r !== 'granted') { toast('o navegador negou a permissão — os lembretes continuam dentro do app', 'warn'); return; } }
              setPref({ notificacoes: v });
            }}>notificação do sistema (além do bip)</Toggle>
            <Toggle checked={!!prefs.som} onChange={(v) => setPref({ som: v })}>bipe sonoro (WebAudio, sem arquivo)</Toggle>
            <Toggle checked={!!prefs.vibrar} onChange={(v) => setPref({ vibrar: v })}>vibrar (se o aparelho permitir)</Toggle>
            <Toggle checked={!!prefs.gentil} onChange={(v) => setPref({ gentil: v })}>modo gentil (comida no máx. 3×/dia, sem cobrança à noite)</Toggle>
          </div>
          <div className="row">
            <span className="tiny">silenciar entre:</span>
            <input style={{ maxWidth: 78 }} value={prefs.silenciosoEntre ? fmtHora(prefs.silenciosoEntre[0]) : ''} placeholder="23:30" onChange={(ev) => setPref({ silenciosoEntre: ev.target.value ? [minDe(ev.target.value), prefs.silenciosoEntre?.[1] ?? 1350] : null })} />
            <span className="tiny">e</span>
            <input style={{ maxWidth: 78 }} value={prefs.silenciosoEntre ? fmtHora(prefs.silenciosoEntre[1]) : ''} placeholder="06:30" onChange={(ev) => setPref({ silenciosoEntre: prefs.silenciosoEntre?.[0] != null ? [prefs.silenciosoEntre[0], minDe(ev.target.value)] : null })} />
            {prefs.silenciosoEntre && <button className="btn xs ghost" onClick={() => setPref({ silenciosoEntre: null })}>limpar</button>}
          </div>
          <div className="row">
            <button className="btn sm primary" onClick={() => { if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification('SmartFit · teste', { body: 'Se você viu isso, o canal está vivo. Os alertas de água/comida usam o mesmo caminho.', tag: 'sf-teste' }); else toast('notificação de sistema indisponível — dentro do app continua funcionando', 'warn'); }}>testar notificação</button>
            <button className="btn sm ghost" onClick={() => { const map = { ...(p.__adiamentos || {}) }; const chaves = Object.keys(map); if (!chaves.length) return toast('nada adiado hoje'); set({ __adiamentos: {} }); toast(`${chaves.length} adiamento(s) zerado(s)`); }}>zerar adiamentos de hoje</button>
            <span className="tiny right">{Object.keys(p.__adiamentos || {}).length} evento(s) adiado(s) hoje</span>
          </div>
          <div className="tiny">Por que o app insiste: o benefício do auto-monitoramento aparece quando o registro é imediato (Michie 2009). E por que tem limite e modo gentil: cobrança sem fim vira ruído que você desliga — Lally 2010 mostra hábito construído por repetição em contexto estável, não por culpa.</div>
        </div>
      </Card>

      <Card title="conta & servidor" tone="pink" aux={store.online ? 'servidor conectado' : 'sem servidor: tudo local'}>
        <div className="col">
          {store.token ? (
            <>
              <div className="row"><span className="pill ok">logado como @{p.handle}{store.conta?.email ? ` (${store.conta.email})` : ''}</span><button className="btn xs" onClick={() => { store.syncComunidade(); toast('feed sincronizado'); }}>sincronizar agora</button><button className="btn xs ghost" onClick={() => { store.logout(); toast('deslogado; dados locais intactos'); }}>sair da conta</button></div>
            </>
          ) : (
            <>
              <div className="grid g3">
                <div><label className="f">e-mail</label><input value={login.email} onChange={(ev) => setLogin({ ...login, email: ev.target.value })} placeholder="voce@exemplo.com" /></div>
                <div><label className="f">handle</label><input value={login.handle} onChange={(ev) => setLogin({ ...login, handle: ev.target.value.replace(/[^a-z0-9_.]/gi, '').toLowerCase() })} /></div>
                <div><label className="f">senha (≥6)</label><input type="password" value={login.senha} onChange={(ev) => setLogin({ ...login, senha: ev.target.value })} /></div>
              </div>
              <div className="row">
                <button className="btn sm primary" onClick={() => store.registrar(login.email, login.senha, login.handle).catch((err: any) => toast(String(err?.message || err), 'bad'))}>criar conta</button>
                <button className="btn sm" onClick={() => store.entrar(login.email, login.senha).catch((err: any) => toast(String(err?.message || err), 'bad'))}>entrar</button>
                <span className="tiny right">senha com scrypt + HMAC no servidor; o handle é o único identificador público</span>
              </div>
            </>
          )}
          <div className="hr" />
          <div className="grid g3">
            <Stat label="estado" value={store.online ? 'online' : 'local'} sub={`${e.xpLog.length} eventos de XP`} />
            <Stat label="PWA" value={permissao === 'granted' ? 'notificações ok' : 'instalar/disponível'} sub={instalavel ? 'pronto para instalar' : 'via menu do navegador'} />
            <Stat label="dias salvos" value={Object.keys(e.dias).length} sub={hojeKey()} />
          </div>
          <button className="btn sm" onClick={async () => { if (!instalavel) return toast('use o menu do navegador → “Instalar app”'); instalavel.prompt(); const r = await instalavel.userChoice; toast(r.outcome === 'accepted' ? 'instalado 🎉' : 'ok, dá pra instalar depois'); setInstalavel(null); }}>instalar como app</button>
          <div className="tiny">Funciona offline: a base de evidência, o gerador de plano, o solver de treino e a Yayá rodam no seu navegador. O servidor só existe para o feed/leaderboard e para sincronizar entre aparelhos.</div>
        </div>
      </Card>

      <Card title="condições que mudam os números" tone="amber" className="span2">
        <div className="grid g2">
          <div>
            <label className="f">marque o que se aplica a você</label>
            <div className="chips">{GRUPOS.map((c) => <Chip key={c} on={(form.condicoes || []).includes(c)} onClick={() => set({ condicoes: (form.condicoes || []).includes(c) ? form.condicoes.filter((x: string) => x !== c) : [...(form.condicoes || []), c] })}>{c}</Chip>)}</div>
            <div className="tiny" style={{ marginTop: 6 }}>gestante/lactante e renal alteram proteína, sódio e ferro <b>na calculadora</b> (não é enfeite): <span className="mono">else if (gestante)</span> em <span className="mono">src/lib/calc.ts</span> e o teste <span className="mono">tests/calc.test.ts</span>.</div>
          </div>
          <div className="col">
            {ativos.length === 0 && <div className="okbox">Nenhuma condição marcada: o app usa as diretrizes populacionais (com os avisos de risco vitalício na aba Evolução).</div>}
            {ativos.map((c: string) => {
              const r = riscos[c];
              return (
                <div key={c} className="warnbox">
                  <b>{r.nome || r.titulo || c}</b>
                  <div className="tiny" style={{ marginTop: 3 }}>{(DB.auditoria?.mitos || []).length ? `perfil de risco: ${(r.riscos || []).join(', ') || '—'} · ${r.grau || ''}` : ''}</div>
                  <div className="row" style={{ marginTop: 4 }}>{(e.metas?.riscos || []).filter((x: any) => x.titulo && x.titulo.toLowerCase().includes(String(c).slice(0, 5))).map((x: any) => <span key={x.id} className="pill warn" title={x.texto}>{x.titulo}: {x.nivel}</span>)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <Card title="sobre este app" className="span2" aux="o que é, o que não é, e como foi feito">
        <div className="grid g3">
          <div className="col tiny" style={{ gap: 6 }}>
            <div className="stat-label">é</div>
            <ul className="tick">
              <li>personal + nutricionista de bolso, com prescrição derivada de 84 fontes auditadas</li>
              <li>jogo: XP, níveis, chefes de reavaliação e emblemas — a progressão é bloqueada por teste objetivo, não por tempo</li>
              <li>coach diário que insiste até você confirmar, com foto sempre opcional</li>
              <li>Yayá: BM25 + seu perfil, e nenhuma resposta sem referência</li>
            </ul>
          </div>
          <div className="col tiny" style={{ gap: 6 }}>
            <div className="stat-label">não é</div>
            <ul className="tick">
              <li>diagnóstico, prescrição medicamentosa ou acompanhamento de doença</li>
              <li>rede social de aparência: sem curtida em corpo, sem peso público</li>
              <li>pesquisador de preço, nem app de dieta da moda</li>
              <li>confiável em número marcado como <span className="pill warn">conferir na fonte</span> — aí o PDF precisa ser aberto por você</li>
            </ul>
          </div>
          <div className="col tiny" style={{ gap: 6 }}>
            <div className="stat-label">como foi feito</div>
            <ul className="tick">
              <li>dados: <span className="mono">data/*.json</span> versionados (fontes, alimentos, exercícios, programa, auditoria)</li>
              <li>cálculo: <span className="mono">src/lib/calc.ts</span> (IOM/ADA/ACSM) + solver <span className="mono">planner.ts</span>, cobertos por 44 testes</li>
              <li>viés: <span className="mono">src/lib/bias.ts</span> + <span className="mono">docs/metodologia-auditoria.md</span></li>
              <li>socio: <span className="mono">server/index.js</span> (node:sqlite), API REST sem dependência externa</li>
              <li>animação dos exercícios: <span className="mono">data/poses.json</span> — esqueletos 2D interpolados, sem foto de stock</li>
            </ul>
            <button className="btn xs ghost" onClick={() => { localStorage.setItem('sf_onboarding', 'reset'); location.reload(); }}>resetar onboarding</button>
          </div>
        </div>
        <div className="hr" />
        <div className="row">
          <span className="tiny">SmartFit · versão de estudo — se algo aqui conflitar com a conduta do seu médico/nutricionista, o deles ganha. Sempre.</span>
          <button className="btn xs right" onClick={() => { flutuar('♿ contraste AA · foco visível · animação respeita prefers-reduced-motion'); }}>acessibilidade</button>
        </div>
      </Card>
    </div>
  );
}

const fmtHora = (m: number) => `${String(Math.floor((m || 0) / 60)).padStart(2, '0')}:${String((m || 0) % 60).padStart(2, '0')}`;
const minDe = (s: string) => { const [h, mi] = String(s || '').split(':').map(Number); return (h || 0) * 60 + (mi || 0); };
