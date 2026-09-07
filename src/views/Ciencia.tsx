import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../App.tsx';
import { DB, fmt, contador } from '../lib/db.ts';
import { buscar, LISTAS } from '../lib/lit.ts';
import { buildIndex, search } from '../lib/yaya.ts';
import { Bar, Card, Chip, FonteDetalhe, Modal, Seg, SourceCard, Toggle, useToast } from '../components/ui.tsx';

const AREAS = [{ v: 'todas', label: 'tudo' }, { v: 'nutricao', label: 'nutrição' }, { v: 'treino', label: 'treino' }, { v: 'estilo', label: 'sono/mente/água' }];

export default function Ciencia() {
  const { store, extra, irPara } = useApp();
  const [aba, setAba] = useState<'base' | 'ao-vivo' | 'auditoria'>('base');
  const [q, setQ] = useState('');
  const [area, setArea] = useState('todas');
  const [grau, setGrau] = useState<string | null>(null);
  const [abrir, setAbrir] = useState<string | null>(null);
  const [esconderAlto, setEsconderAlto] = useState(false);
  const [soHumanos, setSoHumanos] = useState(true);
  const [termos, setTermos] = useState('');
  const [busca, setBusca] = useState<any>(null);
  const [rodando, setRodando] = useState(false);
  const [salvas, setSalvas] = useState<any[]>(() => { try { return JSON.parse(localStorage.getItem('sf_fontes_live') || '[]'); } catch { return []; } });
  const toast = useToast();

  useEffect(() => { if (extra?.fonte) { setAbrir(extra.fonte); setAba('base'); abrirFonte(extra.fonte); } }, [extra]);
  const abrirFonte = (id: string) => { if (!id) return; if (!(store.estado.perfil?.__fontesLidas || []).includes(id)) { store.mutar((x) => ({ ...x, perfil: { ...x.perfil, __fontesLidas: [...(x.perfil.__fontesLidas || []), id] } })); contador(store.mutar, 'lidos'); } };
  useEffect(() => { if (extra?.buscar) { setTermos(extra.buscar); setAba('ao-vivo'); } }, [extra]);

  const idx = useMemo(() => buildIndex([...DB.fontes, ...salvas.map((s) => ({ ...s, _area: 'live' }))] as any, DB.capsulas as any), [salvas.length]);
  const lista = useMemo(() => {
    const base = DB.fontes.filter((f: any) => (area === 'todas' ? true : f._area === area)).filter((f: any) => (grau ? f.e === grau : true))
      .filter((f: any) => !(esconderAlto && /alto/i.test(String(f.g))));
    if (!q.trim()) return base.slice(0, 60);
    const hits = search(q, idx, 90);
    const porId = new Map(base.map((f: any) => [f.id, f]));
    return hits.map((h) => (h.doc.kind === 'fonte' ? porId.get(h.doc.refs![0]) || (h.doc.data as any) : null)).filter(Boolean);
  }, [q, area, grau, esconderAlto, idx]);

  const rodar = async () => {
    if (!termos.trim()) return;
    setRodando(true);
    try {
      const r = await buscar({ termos, excluirSetorial: esconderAlto, soHumanos, anosDe: 2015 });
      setBusca(r);
      if (!r.resultados.length) toast(r.aviso || 'nenhum resultado', 'bad');
    } catch (err: any) {
      setBusca({ resultados: [], aviso: 'falha de rede: ' + (err?.message || err), fonte: 'erro' });
    } finally { setRodando(false); }
  };

  const salvarLive = (t: any) => {
    const id = 'L:' + (t.doi || t.id || t.titulo.slice(0, 30));
    if (salvas.some((s) => s.id === id)) return toast('já está na sua lista local');
    const novo = {
      id, t: t.titulo, a: (t.autores || []).join(', ') || '', j: t.revista || '', y: t.ano, doi: t.doi, link: t.url,
      d: t.design, f: t.resumo ? t.resumo.slice(0, 480) + (t.resumo.length > 480 ? '…' : '') : '(resumo indisponível nos metadados)',
      e: 'C', cf: `financiadores nos metadados: ${(t.financ || []).map((f: any) => f.nome).join('; ') || 'nenhum declarado'} · risco: ${t.risco} (${t.motivo})`,
      g: t.risco === 'alto' ? 'alto' : t.risco === 'baixo' ? 'baixo' : 'médio', no: 'Entrou pela busca ao vivo do app: resumo e desenho lidos do metadado (OpenAlex/Crossref), não do PDF. Antes de seguir a conclusão, leia o artigo — e a seção de funding.',
      tg: ['busca-viva', t.risco], ck: 0,
    };
    if (t.risco === 'alto') contador(store.mutar, 'sinalizados');
    const l = [...salvas, novo];
    localStorage.setItem('sf_fontes_live', JSON.stringify(l)); setSalvas(l);
    toast(`salvo no banco local do app (${l.length} fontes vivas)`);
  };

  const AUD = DB.auditoria;
  return (
    <div className="col" style={{ gap: 12 }}>
      <Card title="a base que sustenta tudo" tone="blue" aux={`${DB.fontes.length + salvas.length} fontes · ${DB.capsulas.length} cápsulas · 100% offline`}>
        <div className="row">
          <Seg opts={[{ v: 'base', label: '📚 base local' }, { v: 'ao-vivo', label: '🔎 busca ao vivo (OpenAlex/Crossref)' }, { v: 'auditoria', label: '🛡 auditoria de viés' }]} value={aba} onChange={setAba} />
          <span className="tiny right">critério: sem funding de quem vende o resultado · desfecho duro · replicado</span>
        </div>
      </Card>

      {aba === 'base' && (
        <>
          <Card>
            <div className="row">
              <input style={{ flex: 1, minWidth: 220 }} placeholder="busque por tema: proteína, creatina, sono, passos, carne, sódio, B12…" value={q} onChange={(e) => setQ(e.target.value)} />
              <Seg opts={AREAS} value={area} onChange={setArea} size="sm" />
              <div className="chips">{['A', 'B', 'C', 'D', 'E'].map((g) => <Chip key={g} on={grau === g} onClick={() => setGrau(grau === g ? null : g)} title="grau de evidência atribuído pelo app">{g}</Chip>)}</div>
              <Toggle checked={esconderAlto} onChange={setEsconderAlto}>esconder risco alto</Toggle>
              <span className="tiny right">{lista.length} resultado(s)</span>
            </div>
          </Card>
          <div className="grid g2">
            {lista.map((f: any) => (
              <Card key={f.id} tone={f.g === 'baixo' ? 'neon' : f.g === 'médio' ? 'amber' : 'pink'}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <b style={{ fontSize: 13.5, lineHeight: 1.3 }}>{f.t}</b>
                  <span className={`grade ${f.e}`}>{f.e}</span>
                </div>
                <div className="tiny">{f.a} · <i>{f.j}</i> {f.y} · {f.d}</div>
                <p style={{ marginTop: 6, marginBottom: 6 }}>{f.f}</p>
                {f.u && <div className="okbox"><b>como o app usa:</b> {f.u}</div>}
                <div className="warnbox" style={{ marginTop: 6 }}><b>conflito:</b> {f.cf}</div>
                {f.no && <div className="badbox" style={{ marginTop: 6 }}><b>ressalva:</b> {f.no}</div>}
                <div className="row" style={{ marginTop: 7 }}>
                  <button className="btn xs ghost" onClick={() => { setAbrir(f.id); abrirFonte(f.id); }}>ficha completa</button>
                  {f.link && <a className="btn xs" href={f.link} target="_blank" rel="noreferrer noopener">abrir ↗</a>}
                  <span className={`pill right ${f.g === 'baixo' ? 'ok' : f.g === 'alto' ? 'bad' : 'warn'}`}>risco {f.g}</span>
                  {f.ck === 0 && <span className="pill warn" title="conferir na fonte">conferir nº/DOI</span>}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {aba === 'ao-vivo' && (
        <div className="grid g2">
          <Card title="consultar a literatura agora" tone="neon" aux={busca ? `fonte: ${busca.fonte}` : 'direto do seu navegador'}>
            <div className="col">
              <input value={termos} onChange={(e) => setTermos(e.target.value)} placeholder='ex.: "plant based diet" blood pressure meta-analysis 2022' onKeyDown={(e) => e.key === 'Enter' && rodar()} />
              <div className="row">
                <Toggle checked={esconderAlto} onChange={setEsconderAlto}>excluir artigos com funding setorial</Toggle>
                <Toggle checked={soHumanos} onChange={setSoHumanos}>só estudos em humanos</Toggle>
                <button className="btn primary" onClick={rodar} disabled={rodando}>{rodando ? 'consultando…' : 'buscar'}</button>
              </div>
              {busca?.aviso && <div className="tiny">{busca.aviso}</div>}
              <div className="tiny">O app usa OpenAlex (que traz a lista de <em className="ref" title="funders: quem pagou o estudo">funders</em>) e cai para o Crossref se falhar. Nada é enviado para servidor nosso: a chamada sai do seu navegador para a API pública, e o resultado fica em cache local por 24 h. Quando o servidor do projeto está no ar, o mesmo endpoint responde por <span className="mono">/api/lit</span>.</div>
              {salvas.length > 0 && (
                <>
                  <div className="hr" />
                  <div className="stat-label">suas fontes vivas salvas ({salvas.length}) — entram no índice da Yayá</div>
                  {salvas.map((s) => <SourceCard key={s.id} id={s.id} compact onOpen={setAbrir} />)}
                </>
              )}
            </div>
          </Card>
          <Card title="resultados" aux={busca ? `${busca.resultados.length} de ${busca.brutos}` : 'aguardando busca'}>
            {!busca && <div className="tiny">Faça uma busca para classificar os trabalhos por risco de viés.</div>}
            {busca?.resultados?.length === 0 && <div className="warnbox">Nada encontrado (ou a rede está caída). A base local continua valendo para tudo que já foi decidido aqui.</div>}
            <div className="col" style={{ gap: 7 }}>
              {(busca?.resultados || []).slice(0, 24).map((t: any, i: number) => (
                <div key={i} className={`card ${t.risco === 'alto' ? 'pink' : t.risco === 'baixo' ? 'neon' : ''}`} style={{ padding: 10 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <b style={{ fontSize: 13 }}>{t.titulo}</b>
                    <span className="pill">{t.design}</span>
                  </div>
                  <div className="tiny">{(t.autores || []).slice(0, 3).join(', ')}{(t.autores || []).length > 3 ? ' et al.' : ''} · <i>{t.revista}</i> {t.ano} · {t.citacoes} citações · peso {fmt.n(t.peso, 2)}</div>
                  <div className="row" style={{ marginTop: 4, gap: 5 }}>
                    <span className={`pill ${t.risco === 'alto' ? 'bad' : t.risco === 'baixo' ? 'ok' : 'warn'}`}>{t.sinal}</span>
                    <span className="tiny">{t.motivo}</span>
                  </div>
                  {t.resumo && <p style={{ margin: '5px 0 0', fontSize: 12 }}>{t.resumo.slice(0, 260)}…</p>}
                  <div className="row" style={{ marginTop: 5 }}>
                    {t.url && <a className="btn xs" href={t.url} target="_blank" rel="noreferrer noopener">abrir ↗</a>}
                    <button className="btn xs ghost" onClick={() => salvarLive(t)}>salvar no app</button>
                    {t.local && <span className="pill blue right">já está na base local</span>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {aba === 'auditoria' && (
        <div className="grid g2">
          <Card title="como esta base foi montada" tone="neon" className="span2">
            <div className="grid g2">
              <ol className="col" style={{ gap: 5, paddingLeft: 18, margin: 0 }}>
                {(AUD.metodo_selecao?.passos || []).map((p: any, i: number) => (
                  <li key={i} style={{ fontSize: 13, color: 'var(--txt-dim)', lineHeight: 1.5 }}><b style={{ color: 'var(--neon)' }}>{typeof p === 'string' ? p.split(':')[0] : `${i + 1}`}</b> {typeof p === 'string' ? p.split(':').slice(1).join(':') : p.passo || JSON.stringify(p)}</li>
                ))}
              </ol>
              <div className="col">
                <div className="stat-label">o que isto não é</div>
                <ul className="tick">{(AUD.metodo_selecao?.o_que_nao_e || []).map((x: string) => <li key={x}>{x}</li>)}</ul>
                <div className="tiny">atualização: {AUD.metodo_selecao?.atualizacao || 'a base local é estática; a busca ao vivo cobre o que saiu depois'}</div>
              </div>
            </div>
          </Card>

          <Card title="níveis de risco comercial" aux="do verde ao vermelho">
            <div className="col">
              {(AUD.riscos_comerciais || []).map((r: any) => (
                <div key={r.nivel} className={`card ${r.cor === 'green' ? 'neon' : r.cor === 'red' ? 'pink' : 'amber'}`} style={{ padding: 10 }}>
                  <b style={{ fontSize: 13 }}>{r.nivel}</b>
                  <div className="tiny">{r.descricao}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="casos documentados" tone="amber" aux="por que desconfiamos de funding">
            <div className="col">
              {(AUD.casos || []).map((c: any) => (
                <details key={c.id} style={{ border: '1px solid var(--line-soft)', borderRadius: 12, padding: '8px 10px', background: 'rgba(255,255,255,0.02)' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 650, fontSize: 13 }}>{c.nome}</summary>
                  <div className="tiny" style={{ marginTop: 6 }}>{c.o_que_aconteceu}</div>
                  <div className="warnbox" style={{ marginTop: 6 }}><b>por que importa:</b> {c.por_que_importa}</div>
                  <div className="okbox" style={{ marginTop: 5 }}><b>o que o app faz:</b> {c.o_app_faz}</div>
                  <div className="row" style={{ marginTop: 5, gap: 4 }}>
                    {(c.refs || []).map((r: string) => DB.porId.get(r) ? <SourceCard key={r} id={r} compact onOpen={setAbrir} /> : <span key={r} className="pill">{r}</span>)}
                    {c.como_dizer && <span className="tiny right" title="como a mídia/advocacy chama isso">{c.como_dizer}</span>}
                  </div>
                </details>
              ))}
            </div>
          </Card>

          <Card title="táticas de marketing baseadas em 'ciência'" aux="aparecem com nomes diferentes, o esqueleto é o mesmo">
            <div className="col">
              {(AUD.taticas_comerciais || []).map((t: any) => (
                <div key={t.id} className="card" style={{ padding: 10 }}>
                  <b style={{ fontSize: 13 }}>{t.nome}</b>
                  <div className="tiny" style={{ marginTop: 3 }}>{t.como}</div>
                  <div className="okbox" style={{ marginTop: 5 }}><b>defesa:</b> {t.defesa}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="listas usadas pelo filtro" aux="o que aparece em funding → ação">
            <div className="col">
              <div className="stat-label" style={{ color: 'var(--red)' }}>bloqueio de recomendação ({LISTAS.bloqueio.length})</div>
              <div className="chips">{LISTAS.bloqueio.map((p) => <span key={p} className="pill bad" title={AUD.listas_filtro.bloqueio_recomendacao.descricao}>{p}</span>)}</div>
              <div className="stat-label" style={{ color: 'var(--amber)', marginTop: 6 }}>monitoramento ({LISTAS.observacao.length})</div>
              <div className="chips">{LISTAS.observacao.map((p) => <span key={p} className="pill warn">{p}</span>)}</div>
              <div className="stat-label" style={{ color: 'var(--neon)', marginTop: 6 }}>financiadores que aumentam a confiança ({LISTAS.publico.length})</div>
              <div className="chips">{LISTAS.publico.map((p) => <span key={p} className="pill ok">{p}</span>)}</div>
              <div className="hr" />
              <div className="stat-label">peso por tipo de desenho</div>
              <div className="grid g3">
                {Object.entries(AUD.listas_filtro.tipos_desenho_peso || {}).map(([k, v]: [string, any]) => (
                  <div key={k}><Bar pct={Number(v)} label={k} right={String(v)} /></div>
                ))}
              </div>
              <div className="tiny">Siglas curtas (DSM, ILSI, BSN) só casam por palavra inteira e só no campo de funding — senão o filtro vira ruído. E a regra honesta: excluímos o artigo como <i>base de recomendação</i>, não o escondemos de você.</div>
            </div>
          </Card>

          <Card title="mitos que o app responde diferente do influencers" tone="pink" className="span2">
            <div className="grid g2">
              {(AUD.mitos || []).map((m: any) => (
                <div key={m.id} className="card" style={{ padding: 10 }}>
                  <b style={{ fontSize: 13, color: 'var(--red)' }}>“{m.titulo}”</b>
                  <div className="tiny" style={{ marginTop: 4 }}>{m.realidade}</div>
                  <div className="row" style={{ marginTop: 5 }}>{(m.refs || []).map((r: string) => DB.porId.get(r) ? <button key={r} className="pill blue" onClick={() => { setAbrir(r); abrirFonte(r); }} title={DB.porId.get(r)?.t}>{r}</button> : null)}
                    <button className="btn xs ghost right" title="registro honesto: você disse não a uma promessa de produto" onClick={() => { contador(store.mutar, 'recusas'); toast('recusa anotada no seu histórico de ceticismo 🛡️'); }}>recuso esse hype</button></div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="módulos extras planejados/ativos" aux="o que este app tem além do briefing" className="span2">
            <div className="grid g3">
              {(AUD.modulos_extra || []).map((m: any) => (
                <div key={m.id} className="card" style={{ padding: 10 }}>
                  <b style={{ fontSize: 13 }}>{m.nome}</b>
                  <div className="tiny" style={{ marginTop: 3 }}>{m.descricao}</div>
                  <div className="tiny" style={{ marginTop: 4, color: m.ativo === false ? 'var(--amber)' : 'var(--neon)' }}>{m.ativo === false ? '◐ parcial: veja como ativar' : '● ativo no app'}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <FonteDetalhe id={abrir} onClose={() => setAbrir(null)} />
    </div>
  );
}
