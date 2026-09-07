import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DB, fmt } from '../lib/db.ts';

export const ToastCtx = createContext<(msg: string, cls?: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function Card({ children, title, tone, aux, style, className = '' }: { children: ReactNode; title?: ReactNode; tone?: string; aux?: ReactNode; style?: any; className?: string }) {
  return (
    <section className={`card ${tone || ''} ${className}`} style={style}>
      {title && <h3>{title}{aux && <span className="aux">{aux}</span>}</h3>}
      {children}
    </section>
  );
}

export function Chip({ on, children, onClick, title }: { on?: boolean; children: ReactNode; onClick?: () => void; title?: string }) {
  return <button type="button" className="chip" aria-pressed={!!on} onClick={onClick} title={title}>{children}</button>;
}

export function Seg({ opts, value, onChange, size }: { opts: { v: any; label: ReactNode }[]; value: any; onChange: (v: any) => void; size?: 'sm' | 'md' }) {
  return (
    <div className="seg" role="tablist">
      {opts.map((o) => (
        <button key={String(o.v)} role="tab" aria-pressed={String(o.v) === String(value)} onClick={() => onChange(o.v)} style={size === 'sm' ? { padding: '5px 9px', fontSize: 12 } : undefined}>{o.label}</button>
      ))}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <label className="f">{label}</label>
      {children}
      {hint && <div className="tiny" style={{ marginTop: -6, marginBottom: 8 }}>{hint}</div>}
    </div>
  );
}

export function NumField({ label, value, onChange, min, max, step = 1, suffix, hint }: { label: string; value: number | null | undefined; onChange: (n: number | null) => void; min?: number; max?: number; step?: number; suffix?: string; hint?: ReactNode }) {
  return (
    <Field label={label + (suffix ? ` (${suffix})` : '')} hint={hint}>
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn sm" onClick={() => onChange(clampN((Number(value) || 0) - step, min, max))}>−</button>
        <input type="number" inputMode="decimal" value={value == null ? '' : value} min={min} max={max} step={step}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} style={{ textAlign: 'center', maxWidth: 110 }} />
        <button type="button" className="btn sm" onClick={() => onChange(clampN((Number(value) || 0) + step, min, max))}>+</button>
      </div>
    </Field>
  );
}
const clampN = (n: number, min?: number, max?: number) => (min != null && n < min ? min : max != null && n > max ? max : Math.round(n * 100) / 100);

export function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

export function Bar({ pct, tone = '', label, right }: { pct: number; tone?: string; label?: ReactNode; right?: ReactNode }) {
  return (
    <div>
      {(label || right) && <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}><span className="tiny">{label}</span><span className="tiny mono">{right}</span></div>}
      <div className={`bar ${tone}`}><span style={{ width: `${Math.max(0, Math.min(100, pct * 100))}%` }} /></div>
    </div>
  );
}

export function Ring({ pct, label, value, color = 'var(--neon)', size = 74 }: { pct: number; label: string; value?: ReactNode; color?: string; size?: number }) {
  const r = (size - 12) / 2, c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct));
  return (
    <div className="ring" title={`${Math.round(p * 100)}% da meta`}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden>
        <circle className="track" cx={size / 2} cy={size / 2} r={r} />
        <circle className="val" cx={size / 2} cy={size / 2} r={r} stroke={color} style={{ color }} strokeDasharray={c} strokeDashoffset={c * (1 - p)} />
      </svg>
      <div className="num">{value ?? `${Math.round(p * 100)}%`}</div>
      <div className="cap">{label}</div>
    </div>
  );
}

export function Stat({ label, value, unit, hint, sub, tone }: { label: string; value: ReactNode; unit?: string; hint?: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className={`card ${tone || ''}`} style={{ padding: 11 }}>
      <div className="stat-label">{label}</div>
      <div className="big" style={{ marginTop: 3 }}>{value}{unit && <span className="dim" style={{ fontSize: 13, fontWeight: 600 }}> {unit}</span>}</div>
      {(hint || sub) && <div className="tiny" style={{ marginTop: 4 }}>{hint || sub}</div>}
    </div>
  );
}

export function Modal({ open, onClose, children, kind, title, wide }: { open: boolean; onClose?: () => void; children: ReactNode; kind?: 'alerta' | ''; title?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && onClose) onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div className={`modal ${kind || ''}`} style={wide ? { width: 'min(880px, 100%)' } : undefined} role="dialog" aria-modal>
        {title && <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}><h2 style={{ margin: 0 }}>{title}</h2>{onClose && <button className="btn sm ghost" onClick={onClose}>fechar ✕</button>}</div>}
        {children}
      </div>
    </div>
  );
}

/** Citação de fonte: mostra desenho, GRADE, conflito de interesse e o selo "conferir na fonte". */
export function SourceCard({ id, compact, onOpen }: { id: string; compact?: boolean; onOpen?: (id: string) => void }) {
  const f = DB.porId.get(id);
  if (!f) return <div className="src tiny">ref “{id}” não encontrada na base local</div>;
  return (
    <div className="src">
      <span className={`grade ${f.e || 'E'}`} title={`Grau de evidência ${f.e}: ${GRADE_LEGENDA[f.e] || ''}`}>{f.e}</span>
      <div className="ev">
        <strong>{f.t}</strong>
        <div className="tiny">
          {f.j ? <>{f.j} · {f.y}</> : <> {f.y}</>}
          {f.d ? <> · <em title="desenho do estudo">{f.d}</em></> : null}
          {f.ck === 0 ? <> · <span style={{ color: 'var(--amber)' }}>⚠️ verificar na fonte (DOI/nº não conferido caractere a caractere)</span></> : null}
        </div>
        {!compact && f.cf && <div className="tiny" style={{ marginTop: 4 }}><b>Conflito de interesse:</b> {f.cf}</div>}
        <div className="row" style={{ marginTop: compact ? 2 : 5 }}>
          {f.link && <a className="tiny" href={f.link} target="_blank" rel="noreferrer noopener">{f.doi ? `doi:${f.doi}` : f.pmid ? `PMID ${f.pmid}` : 'abrir'} ↗</a>}
          {onOpen && <button className="btn xs ghost" onClick={() => onOpen(f.id)}>o que diz</button>}
          <span className="tiny right" title="risco de viés comercial atribuído pelo app">risco: {f.g || '—'}</span>
        </div>
      </div>
    </div>
  );
}
export const GRADE_LEGENDA: Record<string, string> = {
  A: 'alta confiança (revisões sistemáticas/metas consistentes)', B: 'moderada (evidência boa, heterogeneidade ou desfecho substituto)',
  C: 'baixa (observacional consistente ou ensaios pequenos)', D: 'muito baixa (mecanístico/piloto)', E: 'declaração/síntese, não estudo primário',
};

export function FonteDetalhe({ id, onClose }: { id: string | null; onClose: () => void }) {
  const f = id ? DB.porId.get(id) : null;
  return (
    <Modal open={!!f} onClose={onClose} kind="" title={f ? 'O que esta fonte diz' : ''} wide>
      {f && (
        <div className="col">
          <h2 style={{ fontSize: '1.05rem' }}>{f.t}</h2>
          <div className="tiny">{f.a} · {f.j} {f.y}{f.doi ? ` · doi:${f.doi}` : ''}{f.pmid ? ` · PMID ${f.pmid}` : ''}</div>
          <div className="row"><span className={`grade ${f.e}`}>{f.e}</span><span className="pill">{f.d}</span><span className="pill">população: {f.p}</span><span className="pill blue">risco de viés: {f.g}</span>{f.ck === 0 && <span className="pill warn">verificar na fonte</span>}</div>
          {f.f && <div className="okbox"><b> achado:</b> {f.f}</div>}
          {f.u && <div className="card" style={{ padding: 10 }}><span className="stat-label">como o app usa</span><div className="tiny" style={{ marginTop: 4 }}>{f.u}</div></div>}
          {f.e && f.cf ? <div className="warnbox"><b>Conflito de interesse declarado:</b> {f.cf}</div> : null}
          {f.no && <div className="badbox"><b>Ressalva honesta:</b> {f.no}</div>}
          {f.link && <a className="btn sm" href={f.link} target="_blank" rel="noreferrer noopener">abrir na fonte ↗</a>}
        </div>
      )}
    </Modal>
  );
}

/** Mini gráfico de linha SVG (sem lib), usado em peso/aderência/proteína. */
export function Spark({ dados, pontos, labels, altura = 78, cor = 'var(--neon)', meta, unidade }: { dados?: { x: string; y: number | null }[]; pontos?: (number | null)[]; labels?: string[]; altura?: number; cor?: string; meta?: number; unidade?: string }) {
  dados = dados || (pontos || []).map((y, i) => ({ x: labels?.[i] || String(i), y }));
  const pts = dados.map((d, i) => ({ i, y: d.y == null ? null : Number(d.y) })).filter((p) => p.y != null) as { i: number; y: number }[];
  if (pts.length < 2) return <div className="tiny" style={{ padding: '14px 0' }}>registre 2 dias ou mais para ver a curva</div>;
  const ys = pts.map((p) => p.y).concat(meta != null ? [meta] : []);
  const min = Math.min(...ys), max = Math.max(...ys), dy = max - min || 1;
  const W = 100, H = 100;
  const px = (i: number) => (i / Math.max(1, dados.length - 1)) * W;
  const py = (y: number) => H - ((y - min) / dy) * (H - 12) - 6;
  const path = pts.map((p, k) => `${k ? 'L' : 'M'}${px(p.i).toFixed(2)},${py(p.y).toFixed(2)}`).join(' ');
  const area = `${path} L${px(pts[pts.length - 1].i)},${H} L${px(pts[0].i)},${H} Z`;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: altura, display: 'block' }}>
        <defs><linearGradient id={`g${cor}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={cor} stopOpacity="0.32" /><stop offset="100%" stopColor={cor} stopOpacity="0" /></linearGradient></defs>
        {meta != null && <line x1="0" x2={W} y1={py(meta)} y2={py(meta)} stroke="var(--amber)" strokeWidth="0.6" strokeDasharray="2 2" />}
        <path d={area} fill={`url(#g${cor})`} />
        <path d={path} fill="none" stroke={cor} strokeWidth="1.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {pts.map((p) => <circle key={p.i} cx={px(p.i)} cy={py(p.y)} r="1.2" fill={cor} />)}
      </svg>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="tiny">{fmt.data(dados[0].x)}</span>
        <span className="tiny mono">{fmt.n(pts[pts.length - 1].y, 1)}{unidade} {meta != null ? `· meta ${fmt.n(meta, 1)}${unidade || ''}` : ''}</span>
        <span className="tiny">{fmt.data(dados[dados.length - 1].x)}</span>
      </div>
    </div>
  );
}

export function useAgora(intervaloMs = 1000) {
  const [t, setT] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setT(new Date()), intervaloMs); return () => clearInterval(id); }, [intervaloMs]);
  return t;
}
export const minutosDoDia = (d = new Date()) => d.getHours() * 60 + d.getMinutes();

/** Bolha de +XP que sobe da tela (feedback de jogo). */
export function useXpFloat() {
  const [floats, setFloats] = useState<{ id: number; x: number; y: number; txt: string }[]>([]);
  const next = useRef(1);
  const push = (txt: string) => {
    const id = next.current++;
    const x = window.innerWidth / 2 + (Math.random() * 120 - 60), y = window.innerHeight - 140;
    setFloats((f) => [...f, { id, x, y, txt }]);
    setTimeout(() => setFloats((f) => f.filter((z) => z.id !== id)), 1150);
  };
  const node = useMemo(() => (
    <> {floats.map((f) => <div key={f.id} className="xpfloat" style={{ left: f.x, top: f.y }}>{f.txt}</div>)}</>
  ), [floats]);
  return { push, node };
}

export function Heat({ dias, chave }: { dias: Record<string, any>; chave: (d: any) => number }) {
  const chaves = Object.keys(dias).sort();
  const fim = chaves.length ? new Date(chaves[chaves.length - 1]) : new Date();
  const cells: { k: string; v: number }[] = [];
  for (let i = 13 * 7 - 1; i >= 0; i--) {
    const d = new Date(fim); d.setDate(d.getDate() - i);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    cells.push({ k, v: dias[k] ? chave(dias[k]) : 0 });
  }
  const hoje = new Date().toISOString().slice(0, 10);
  return (
    <div className="heat" title="aderência por dia nas últimas 13 semanas">
      {cells.map((c) => <i key={c.k} className={`${c.v >= 1 ? 'l3' : c.v >= 0.6 ? 'l2' : c.v > 0 ? 'l1' : ''} ${c.k === hoje ? 'hoje' : ''}`} title={`${c.k}: ${Math.round(c.v * 100)}%`} />)}
    </div>
  );
}
