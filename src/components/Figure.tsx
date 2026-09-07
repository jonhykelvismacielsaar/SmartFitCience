import { useEffect, useMemo, useRef, useState } from 'react';
import { DB } from '../lib/db.ts';

type Pt = [number, number];
type Frame = { p: Pt[]; ex?: Pt[]; bar?: [Pt, Pt] };

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpPt = (a: Pt, b: Pt, t: number): Pt => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

function interp(frames: Frame[], phase: number): { p: Pt[]; ex?: Pt[]; bar?: [Pt, Pt] } {
  const n = frames.length;
  if (n < 2) return frames[0] || { p: [] };
  // pingue-pongue: 0 → 1 → 0 (excêntrica + concêntrica)
  const pp = phase <= 0.5 ? phase * 2 : (1 - phase) * 2;
  const x = ease(pp) * (n - 1);
  const i = Math.min(n - 2, Math.floor(x));
  const t = x - i;
  const A = frames[i], B = frames[i + 1];
  return {
    p: A.p.map((pt, k) => lerpPt(pt, B.p[k] ?? pt, t)),
    ex: A.ex && B.ex ? A.ex.map((pt, k) => lerpPt(pt, B.ex![k] ?? pt, t)) : A.ex,
    bar: A.bar && B.bar ? [lerpPt(A.bar[0], B.bar[0], t), lerpPt(A.bar[1], B.bar[1], t)] : A.bar,
  };
}

/** Diagrama animado da execução (SVG vetorial a partir de data/poses.json — offline, sem vídeo). */
export function ExerciseFigure({ pose, playing = true, speed = 1, altura = 190, rotulo }: { pose?: string; playing?: boolean; speed?: number; altura?: number; rotulo?: string }) {
  const clip = pose ? (DB.poses as any)[pose] : null;
  const frames: Frame[] = clip?.frames || [];
  const [phase, setPhase] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const dur = (clip?.dur || 2600) / Math.max(0.25, speed);
    let ultimo = performance.now();
    const tick = (now: number) => {
      const d = now - ultimo; ultimo = now;
      setPhase((p) => (p + d / dur) % 1);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, speed, frames.length, clip?.dur]);

  const pos = useMemo(() => (frames.length ? interp(frames, phase) : null), [frames, phase]);
  const v = clip?.v || 'l';
  if (!pos) return <div className="figure" style={{ height: altura, display: 'grid', placeItems: 'center' }}><span className="tiny">sem diagrama para este movimento — use o vídeo do professor ou a lista de cues</span></div>;
  const [cabeca, ombro, quadril, joelho, tornozelo, cotovelo, punho] = pos.p;
  const [joelho2, tornozelo2, cotovelo2, punho2] = pos.ex || [];
  const linha = (a?: Pt, b?: Pt, cls = 'bone', w?: number) => (a && b ? <path className={cls} d={`M${a[0]},${a[1]} L${b[0]},${b[1]}`} strokeWidth={w} key={`${cls}${a[0]}${b[0]}`} /> : null);
  const junta = (p?: Pt, r = 2.1) => (p ? <circle className="joint" cx={p[0]} cy={p[1]} r={r} key={`j${p[0]}${p[1]}`} /> : null);
  return (
    <div className="figure" role="img" aria-label={`Diagrama animado: ${rotulo || pose}`}>
      <svg viewBox="0 0 100 100" style={{ height: altura }}>
        <line className="floor" x1="4" y1="95" x2="96" y2="95" />
        <text x="5" y="11" fill="rgba(255,255,255,0.35)" fontSize="5" fontFamily="ui-monospace,monospace">{(v === 'l' ? 'vista lateral' : 'vista frontal')}{pose ? ` · ${pose}` : ''}</text>
        {/* sombras do movimento (posição extrema) para percepção de amplitude */}
        <g opacity={0.5}>{(() => { const a = interp(frames, 0.02), b = interp(frames, 0.5); return <> {linha(a.p[2], a.p[3], 'ghost')}{linha(a.p[3], a.p[4], 'ghost')}{linha(b.p[2], b.p[3], 'ghost')}{linha(b.p[3], b.p[4], 'ghost')}</>; })()}</g>
        <g opacity="0.5">
          {linha(quadril, joelho2, 'bone')}{linha(joelho2, tornozelo2, 'bone')}
          {linha(ombro, cotovelo2, 'bone')}{linha(cotovelo2, punho2, 'bone')}
        </g>
        {linha(ombro, quadril, 'bone', 3)}
        {linha(quadril, joelho)}{linha(joelho, tornozelo)}
        {linha(ombro, cotovelo)}{linha(cotovelo, punho)}
        {linha(cabeca, ombro, 'bone', 2.6)}
        {pos.bar && <>
          <line className="bar" x1={pos.bar[0][0]} y1={pos.bar[0][1]} x2={pos.bar[1][0]} y2={pos.bar[1][1]} />
          <rect className="plate" x={pos.bar[0][0] - 2.6} y={pos.bar[0][1] - 4.4} width="2.2" height="8.8" rx="1" />
          <rect className="plate" x={pos.bar[1][0] + 0.4} y={pos.bar[1][1] - 4.4} width="2.2" height="8.8" rx="1" />
        </>}
        {junta(cabeca, 3.2)}{junta(ombro)}{junta(quadril, 2.4)}{junta(joelho)}{junta(tornozelo, 1.7)}{junta(cotovelo, 1.7)}{junta(punho, 1.6)}
        {junta(joelho2, 1.7)}{junta(tornozelo2, 1.5)}{junta(cotovelo2, 1.5)}{junta(punho2, 1.4)}
      </svg>
    </div>
  );
}

/** Silhueta com o volume semanal por grupo (Schoenfeld 2017): quanto mais escuro, mais séries. */
export function BodyHeat({ volumes, sexo = 'm' }: { volumes: Record<string, number>; sexo?: 'm' | 'f' }) {
  const max = Math.max(10, ...Object.values(volumes || {}));
  const op = (g: string) => Math.min(0.92, 0.12 + ((volumes[g] || 0) / max) * 0.8);
  const R = (x: number, y: number, w: number, h: number, g: string, rx = 3) => <rect className="muscle" x={x} y={y} width={w} height={h} rx={rx} opacity={op(g)} key={g}><title>{`${g}: ${volumes[g] || 0} séries/semana`}</title></rect>;
  return (
    <svg viewBox="0 0 100 130" style={{ width: '100%', maxWidth: 210, display: 'block', margin: '0 auto' }} role="img" aria-label="mapa de volume por grupo muscular">
      <g fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.16)">
        <circle cx="50" cy="12" r="8" />
        <rect x="38" y="22" width="24" height="34" rx="7" />
        <rect x="27" y="24" width="9" height="30" rx="4.5" /><rect x="64" y="24" width="9" height="30" rx="4.5" />
        <rect x="25" y="54" width="9" height="28" rx="4.5" /><rect x="66" y="54" width="9" height="28" rx="4.5" />
        <rect x="39" y="58" width="10" height="34" rx="5" /><rect x="51" y="58" width="10" height="34" rx="5" />
        <rect x="39" y="94" width="10" height="30" rx="5" /><rect x="51" y="94" width="10" height="30" rx="5" />
      </g>
      {R(40, 22, 20, 8, 'peito')}
      {R(38, 30, 24, 9, 'dorsal')}
      {R(26, 24, 10, 10, 'deltoide')}
      {R(64, 24, 10, 10, 'deltoide_f')}
      {R(25, 36, 9, 16, 'biceps')}
      {R(66, 36, 9, 16, 'triceps')}
      {R(39, 42, 22, 14, 'abdomen')}
      {R(39, 58, 10, 22, 'quadríceps')}
      {R(51, 58, 10, 22, 'quadríceps_f')}
      {R(38, 84, 11, 16, 'isquio')}
      {R(51, 84, 11, 16, 'isquio_f')}
      {R(39, 100, 22, 10, 'gluteo')}
      {R(39, 110, 22, 12, 'panturrilha')}
      <title>{`volume semanal — máx ${max} séries`}</title>
    </svg>
  );
}

/** Prancha/lado: vista didática estática com anotações de alinhamento (usado no exercício de core). */
export function AlinhamentoPlancha({ erro }: { erro?: boolean }) {
  const quadril = erro ? 62 : 46;
  return (
    <div className="figure">
      <svg viewBox="0 0 100 70" style={{ height: 140 }}>
        <line className="floor" x1="6" y1="60" x2="94" y2="60" />
        <path className="bone" d={`M20,60 L28,44 L${44},${quadril} L62,44 L78,44`} />
        <path className="bone" d="M28,44 L28,60" />
        <circle className="joint" cx="18" cy="40" r="4" />
        {erro && <path className="ghost" d="M34,34 L74,34" stroke="var(--red)" strokeDasharray="2 3" />}
        {!erro && <path className="ghost" d="M20,44 L80,44" stroke="var(--neon)" strokeDasharray="2 3" />}
        <text x="6" y="12" fontSize="5" fill={erro ? 'var(--red)' : 'var(--neon)'}>{erro ? 'quadril caindo/subindo: loss of neutral spine' : 'orelha–ombro–quadril–tornozelo em linha'}</text>
      </svg>
    </div>
  );
}

export function RomBarra({ atual, meta }: { atual: number; meta: number }) {
  const pct = Math.max(0, Math.min(1.4, atual / (meta || 1)));
  return (
    <div className="bar" title={`amplitude ${Math.round(atual)}° de ${Math.round(meta)}°`}>
      <span style={{ width: `${Math.min(100, pct * 100)}%`, background: pct >= 1 ? 'linear-gradient(90deg,var(--neon),#4fe0ff)' : 'linear-gradient(90deg,var(--amber),#ff9f4a)' }} />
    </div>
  );
}
