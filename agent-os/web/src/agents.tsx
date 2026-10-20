import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Bot, Brain, Check, CheckCircle2, Circle, Code2, Compass, Loader2, MessageSquare, Monitor, Play, Settings2, Shield, Sparkles, Target, Users, Wallet, Activity, X } from 'lucide-react';
import { profilePath, api, Item, patch, post, put } from './api';
import './agents.css';
import { desiredDeployments } from './deployments';

interface AgentProps { profile: Item; }
interface SetupField { id: string; label: string; type: string; required: boolean; options: string[]; hint: string; default: string; min: number | null; max: number | null; }
interface Configuration { preset: { fields: SetupField[]; role: string } | null; values: Record<string, string | number>; missing: string[]; context_ready: boolean; revision: number; identity_hash: string; }

const icons: Record<string, typeof Bot> = { ara: Sparkles, agnes: Brain, titan: Activity, ledger: Wallet, atlas: Target, scout: Compass };
const themes: Record<string, string> = { ara: 'sage', agnes: 'lavender', titan: 'coral', ledger: 'sand', atlas: 'sage', scout: 'blue' };
const order = ['ara', 'agnes', 'titan', 'ledger', 'atlas', 'scout'];

export function AgentReadiness({ profile: p }: AgentProps) {
  const ready = p.chat_ready ?? (p.model_connection && p.enabled && p.provision_state === 'ready');
  return <span className={`agent-readiness ${ready ? 'is-ready' : ''}`}><i />{!p.enabled ? 'Paused' : p.provision_state !== 'ready' ? 'Runtime needs attention' : ready ? 'Model selected' : 'Connect a model'}</span>;
}

export function AgentDirectory({ profiles, open, create }: { profiles: Item[]; open: (id: string) => void; create: () => void }) {
  const [query, setQuery] = useState('');
  const active = profiles.filter(p => !p.retired_preset).sort((a, b) => (order.indexOf(a.preset) < 0 ? 99 : order.indexOf(a.preset)) - (order.indexOf(b.preset) < 0 ? 99 : order.indexOf(b.preset)));
  const matches = active.filter(p => `${p.name} ${p.preset_spec?.role || p.description}`.toLowerCase().includes(query.toLowerCase()));
  const ara = matches.find(p => p.preset === 'ara');
  const retained = profiles.filter(p => p.retired_preset);
  return <div className="agents-directory">
    <div className="page-title"><div><div className="eyebrow">A SMALL TEAM, BUILT AROUND YOU</div><h1>Your agents</h1><p>One orchestrator. Specialists with their own context, tools, and memories.</p></div><button onClick={create}><Bot size={16} />Create agent</button></div>
    <div className="agents-search"><label><span className="sr-only">Search agents</span><Compass size={17} /><input placeholder="Find an agent or a kind of work…" value={query} onChange={e => setQuery(e.target.value)} /></label><span>{active.length} agents · {active.filter(p => p.chat_ready).length} with a model selected</span></div>
    {ara && <button className="orchestrator-card" onClick={() => open(ara.id)} aria-label={`Open agent ${ara.name}`}><div className="orchestrator-mark"><Sparkles size={32} strokeWidth={1.3} /></div><div><span className="agent-kicker">YOUR HOME BASE · SYSTEM ORCHESTRATOR</span><h2>{ara.name}</h2><p>{ara.preset_spec?.description || ara.description}</p><div className="agent-placement-badges"><AgentReadiness profile={ara} /><span className="deployment-card-count"><Monitor size={11} />{desiredDeployments(ara).length} assigned machines</span></div></div><span className="orchestrator-cta">Open workspace<ArrowRight size={18} /></span></button>}
    <div className="agent-section-label"><h2>Your specialists</h2><span>Different strengths. Clear boundaries.</span></div>
    <div className="profile-grid specialist-grid">{matches.filter(p => p.id !== ara?.id).map(p => {
      const Icon = icons[p.preset] || Bot;
      const deployedCount = desiredDeployments(p).length;
      return <button className={`profile-card specialist-card agent-${p.preset}`} key={p.id} onClick={() => open(p.id)} aria-label={`Open agent ${p.name}`}>
        <div className="specialist-card-top"><span className={`avatar ${themes[p.preset] || 'sage'}`}><Icon size={23} strokeWidth={1.5} /></span><div className="agent-placement-badges"><span className="deployment-card-count"><Monitor size={11} />{deployedCount} machine{deployedCount === 1 ? '' : 's'}</span><AgentReadiness profile={p} /></div></div>
        <h3>{p.name}</h3><strong className="specialist-role">{p.preset_spec?.role || p.description}</strong><p>{p.preset_spec?.description || 'An independent agent configured for your work.'}</p>
        <div className="specialist-capabilities">{(p.preset_spec?.capabilities || ['Native tools', 'Private memory']).slice(0, 2).map((c: string) => <span key={c}>{c}</span>)}</div>
        <footer><span>{p.context_ready ? 'Preferences saved' : 'Personalize this agent'}</span><ArrowRight size={16} /></footer>
      </button>;
    })}</div>
    {!matches.length && <div className="panel padded"><h2>No matching agents</h2><p>Try another name or area of work.</p></div>}
    {retained.length > 0 && <details className="retained-agents"><summary>Previous profiles ({retained.length})<span>Data and conversations retained</span></summary><p>These profiles are outside the current preset roster. Ara handles orchestration; Soma is not part of this release.</p><div className="button-row">{retained.map(p => <button key={p.id} onClick={() => open(p.id)}>{p.name}<ArrowRight size={14} /></button>)}</div></details>}
    <div className="agents-footnote"><Shield size={15} /><p>Each agent is a native Hermes profile. Data access and specialist delegation are granted explicitly; signing in to one profile does not configure the others.</p></div>
  </div>;
}

export function AgentHome({ profile: p, datasets, navigate, ask }: AgentProps & { datasets: Item[]; navigate: (tab: string) => void; ask: (prompt: string) => void }) {
  const spec = p.preset_spec;
  const bound = datasets.filter(d => (p.bindings || []).some((b: Item) => b.dataset_id === d.id));
  const checks = [
    { title: 'Machine deployments', description: `${desiredDeployments(p).length} assigned machines · deploy or undeploy instances`, ready: desiredDeployments(p).length > 0, tab: 'deployments' },
    { title: 'Runtime', description: 'Native profile and working directory', ready: p.provision_state === 'ready', tab: 'connections' },
    { title: 'Model connection', description: p.model_connection?.model || 'Choose an account and model', ready: p.model_ready, tab: 'connections' },
    { title: 'Personal context', description: p.context_ready ? 'Your preferences are saved' : 'Make this agent work your way', ready: p.context_ready, tab: 'setup' },
    { title: p.preset === 'ara' ? 'Specialist access' : 'Data access', description: p.preset === 'ara' ? `${p.delegation_targets?.length || 0} permitted specialists` : `${bound.length} explicitly bound datasets`, ready: p.preset === 'ara' ? !!p.delegation_targets?.length : !!bound.length, tab: 'data' },
  ];
  return <div className="agent-home">
    <section className={`agent-intro agent-${p.preset}`}><div><span className="agent-kicker">{p.preset === 'ara' ? 'YOUR SYSTEM ORCHESTRATOR' : 'YOUR SPECIALIST WORKSPACE'}</span><h2>{spec?.role || p.description}</h2><p>{spec?.description || 'Give this agent clear context and the tools it needs.'}</p><div className="button-row"><button className="primary" onClick={() => navigate(p.model_ready ? 'conversation' : 'connections')}><MessageSquare size={15} />{p.model_ready ? 'Start a conversation' : 'Connect a model'}</button><button onClick={() => navigate(spec ? 'setup' : 'identity')}><Settings2 size={15} />{spec ? 'Personalize agent' : 'Edit identity'}</button></div></div><span className={`agent-intro-icon ${themes[p.preset] || 'sage'}`}>{(() => { const Icon = icons[p.preset] || Bot; return <Icon size={62} strokeWidth={1} />; })()}</span></section>
    <div className="agent-home-grid"><section className="panel agent-checklist"><div className="agent-panel-heading"><h3>Make it yours</h3><span>{checks.filter(c => c.ready).length} of {checks.length}</span></div>{checks.map(c => <button key={c.title} onClick={() => navigate(c.tab)}>{c.ready ? <CheckCircle2 className="check-done" size={19} /> : <Circle size={19} />}<span><strong>{c.title}</strong><small>{c.description}</small></span><ArrowRight size={15} /></button>)}</section>
      <section className="panel agent-starting-points"><div className="agent-panel-heading"><h3>A place to begin</h3><Sparkles size={16} /></div>{(spec?.prompts || ['Help me get started']).map((prompt: string) => <button key={prompt} onClick={() => ask(prompt)}>{prompt}<ArrowRight size={15} /></button>)}<p>Prompts open a draft for you to review before sending.</p></section></div>
    {p.preset === 'agnes' && <div className="agent-privacy-note"><Shield size={18} /><div><strong>A private space, with clear expectations</strong><p>Choose what to share and record. Conversations use Hermes’s saved sessions; this workspace does not promise an off-the-record mode. Reflection records stay unavailable to other agents until you grant access.</p></div></div>}
    {spec?.capabilities && <div className="agent-capability-row">{spec.capabilities.map((c: string) => <span key={c}><Check size={13} />{c}</span>)}</div>}
  </div>;
}

export function AgentSetup({ profile: p, refresh }: AgentProps & { refresh: () => Promise<void> }) {
  const [data, setData] = useState<Configuration | null>(null);
  const [values, setValues] = useState<Record<string, string | number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const load = useCallback(async () => {
    try { const next = await api<Configuration>(profilePath(p, `/configuration`)); setData(next); setValues(next.values); setError(''); }
    catch (e) { setError((e as Error).message); }
  }, [p.id]);
  useEffect(() => { load(); }, [load]);
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!data) return; setBusy(true); setError(''); setSaved('');
    try { const result = await put<Configuration>(profilePath(p, `/configuration`), { values, revision: data.revision, identity_hash: data.identity_hash }); setData(result); setValues(result.values); setSaved('Preferences saved for new conversations. Existing sessions keep their current context.'); await refresh(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  if (!data && !error) return <div className="panel padded"><Loader2 className="spin" size={20} />Loading agent preferences…</div>;
  return <div className="agent-setup-layout"><section className="panel agent-setup-form"><div className="agent-panel-heading"><div><span className="agent-kicker">CONTEXT THAT BELONGS TO THIS AGENT</span><h2>Personalize {p.name}</h2><p>Adapted from the original agent onboarding, saved into this profile’s native identity.</p></div></div>
    {error && <div className="notice warning" role="alert">{error}<button type="button" onClick={load}>Reload configuration</button></div>}{saved && <div className="notice" role="status"><CheckCircle2 size={16} />{saved}</div>}
    <form onSubmit={save}>{data?.preset?.fields.map(f => <label key={f.id}><span>{f.label}{f.required && <span className="field-required">Required</span>}</span>{f.type === 'select' ? <select value={values[f.id] ?? ''} required={f.required} onChange={e => setValues(v => ({ ...v, [f.id]: e.target.value }))}><option value="">Choose…</option>{f.options.map(o => <option key={o} value={o}>{o}</option>)}</select> : f.type === 'textarea' ? <textarea rows={3} maxLength={6000} required={f.required} value={values[f.id] ?? ''} onChange={e => setValues(v => ({ ...v, [f.id]: e.target.value }))} /> : <input type={f.type} step={f.id === 'days_per_week' ? 1 : 'any'} min={f.min ?? undefined} max={f.max ?? undefined} maxLength={6000} required={f.required} value={values[f.id] ?? ''} onChange={e => setValues(v => ({ ...v, [f.id]: f.type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value }))} />}{f.hint && <small>{f.hint}</small>}</label>)}<button className="primary" disabled={busy || !data?.preset} type="submit">{busy ? <Loader2 className="spin" size={16} /> : <Check size={16} />}Save agent preferences</button></form></section>
    <aside><section className="panel agent-setup-note"><Shield size={23} /><h3>Personal context stays scoped</h3><p>These preferences belong to {p.name}. They do not grant access to another profile’s memory or datasets.</p><hr /><h3>Built on Hermes</h3><p>Identity is stored in <code>SOUL.md</code>. Your own identity edits are preserved outside the managed preferences section. New conversations receive updates.</p><p>Models, account login, tools, memory, and scheduled work use the native profile controls in the other tabs.</p></section></aside></div>;
}

export function PlanningSurface({ id }: { id: string }) {
  const [dataset, setDataset] = useState<Item | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<Item>(`/datasets/${id}`).then(setDataset), [id]);
  useEffect(() => { load().catch(e => setError(e.message)); }, [load]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError('');
    const payload = Object.fromEntries(new FormData(e.currentTarget));
    try { await post(`/datasets/${id}/records`, { payload, operation_id: crypto.randomUUID() }); setAdding(false); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function move(task: Item, status: string) {
    setError('');
    try { await patch(`/records/${task.id}`, { revision: task.revision, values: { ...task.payload, status } }); await load(); }
    catch (e) { setError((e as Error).message); }
  }
  const tasks: Item[] = dataset?.records || [];
  return <section className="panel planning-surface"><div className="agent-panel-heading"><div><span className="agent-kicker">SMALL STEPS, REAL PROGRESS</span><h2>{dataset?.name || 'Your plan'}</h2><p>{tasks.filter(t => t.payload.status === 'done').length} of {tasks.length} tasks complete</p></div><button onClick={() => setAdding(!adding)} disabled={dataset?.archived}>New task</button></div>
    {error && <div className="notice warning" role="alert">{error}</div>}
    {adding && <form className="planning-add" onSubmit={save}><label>Task or goal<input name="title" required maxLength={200} /></label><div className="form-columns"><label>Priority<select name="priority"><option>normal</option><option>high</option><option>low</option></select></label><label>Target date<input type="date" name="date" /></label></div><label>Next steps<textarea name="content" rows={2} /></label><button disabled={busy} className="primary">{busy ? 'Saving…' : 'Save task'}</button></form>}
    <div className="planning-board">{[{ id: 'planned', label: 'Next up' }, { id: 'in_progress', label: 'In progress' }, { id: 'done', label: 'Done' }].map(column => <div className="planning-column" key={column.id}><h3>{column.label}<span>{tasks.filter(t => (t.payload.status || 'planned') === column.id).length}</span></h3>{tasks.filter(t => (t.payload.status || 'planned') === column.id).map(task => <article key={task.id}><span className={`task-priority priority-${task.payload.priority || 'normal'}`}>{task.payload.priority || 'normal'} priority</span><h4>{task.payload.title}</h4>{task.payload.content && <p>{task.payload.content}</p>}{task.payload.date && <small>Target · {task.payload.date}</small>}<label><span className="sr-only">Status for {task.payload.title}</span><select aria-label={`Status for ${task.payload.title}`} value={task.payload.status || 'planned'} onChange={e => move(task, e.target.value)} disabled={dataset?.archived}>{['planned', 'in_progress', 'done', 'paused'].map(s => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}</select></label></article>)}{!tasks.some(t => (t.payload.status || 'planned') === column.id) && <p className="planning-empty">{column.id === 'planned' ? 'A little room for your next step.' : column.id === 'done' ? 'Progress will collect here.' : 'One thing at a time.'}</p>}</div>)}</div>
    {tasks.some(t => t.payload.status === 'paused') && <details><summary>Paused tasks</summary>{tasks.filter(t => t.payload.status === 'paused').map(task => <div className="planning-paused" key={task.id}><span>{task.payload.title}</span><button onClick={() => move(task, 'planned')}>Return to next up</button></div>)}</details>}
    <p className="hint">These are saved planning records. Reminders and recurring work are configured separately in Automations.</p>
  </section>;
}

function SwarmExecutionSettings({ profile, config, saved }: { profile: Item; config: any; saved: () => Promise<void> }) {
  const [error, setError] = useState('');
  return <details className="panel padded" style={{ marginBottom: 20 }}>
    <summary><strong>Execution owner, workspace and worker limits</strong></summary>
    <p>Every profile can coordinate its own swarm. Worker model connections resolve on the selected execution machine.</p>
    {error && <div className="notice warning" role="alert">{error}</div>}
    <div className="two-columns">
      <form key={JSON.stringify(config)} onSubmit={async e => {
        e.preventDefault(); const f = new FormData(e.currentTarget);
        try { await put('/profiles/' + profile.id + '/swarms', {
          workspace: String(f.get('workspace') || '') || null,
          toolsets: f.getAll('toolsets'), max_workers: Number(f.get('max_workers')),
          max_concurrent: Number(f.get('max_concurrent')), max_iterations: Number(f.get('max_iterations')),
          timeout_seconds: Number(f.get('timeout_seconds'))
        }); await saved(); setError(''); } catch (e) { setError((e as Error).message); }
      }}>
        <label>Local Git workspace<input name="workspace" defaultValue={config.workspace || ''} placeholder="/absolute/path/to/repository" /></label>
        <p className="hint">Coding requires a clean committed Git baseline. Worktrees preserve the source repository. These are not OS sandboxes.</p>
        <fieldset><legend>Explicit worker tool grants</legend>{['web', 'file', 'terminal'].map(t =>
          <label key={t}><input type="checkbox" name="toolsets" value={t} defaultChecked={config.toolsets?.includes(t)} /> {t}</label>)}</fieldset>
        <div className="form-columns">
          <label>Worker limit<input type="number" name="max_workers" min="1" max="8" defaultValue={config.max_workers} required /></label>
          <label>Concurrent workers<input type="number" name="max_concurrent" min="1" max="4" defaultValue={config.max_concurrent} required /></label>
          <label>Iterations per worker<input type="number" name="max_iterations" min="1" max="40" defaultValue={config.max_iterations} required /></label>
          <label>Seconds per worker<input type="number" name="timeout_seconds" min="1" max="1800" defaultValue={config.timeout_seconds} required /></label>
        </div><button>Save worker policy</button>
      </form>
      <aside className="deployment-settings-note"><Monitor size={25} />
        <h3>Run on your deployed machines</h3><p>Manage this agent’s machine assignments in the Deployments tab. You can enable it on several nodes and choose one for each swarm run.</p>
        <p>Each node keeps its own model connection, workspace and worker permissions.</p>
      </aside>
    </div>
  </details>;
}

export function SwarmPanel({ profile: p, act, refresh }: { profile: Item; act: (f: () => Promise<any>) => Promise<void>; refresh: () => Promise<void> }) {
  const [data, setData] = useState<any>(null);
  const [enabled, setEnabled] = useState(false);
  const [triggerMode, setTriggerMode] = useState('intelligent');
  const [allowedPresets, setAllowedPresets] = useState<string[]>([]);
  const [deployPreset, setDeployPreset] = useState<string | null>(null);
  const [inspectRun, setInspectRun] = useState<Item | null>(null);
  const [taskText, setTaskText] = useState('');
  const [roles, setRoles] = useState('[{"role":"Implementer A","objective":"Implement an independent component","stage":0},{"role":"Implementer B","objective":"Implement a different independent component","stage":0},{"role":"Reviewer","objective":"Review inherited changes and run tests","stage":1}]');
  const [deploymentId, setDeploymentId] = useState(() => Array.from(crypto.getRandomValues(new Uint8Array(16)), v => v.toString(16).padStart(2, '0')).join(''));
  const [executionMachine, setExecutionMachine] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api(profilePath(p, `/swarms`));
      setData(res);
      setEnabled(!!res.config?.enabled);
      setTriggerMode(res.config?.trigger_mode || 'intelligent');
      setAllowedPresets(res.config?.allowed_presets || []);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [p.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!inspectRun) return;
    const id = inspectRun.id;
    const timer = setInterval(() => api('/swarms/' + id).then(run => {
      setInspectRun(run);
      setData((previous: any) => previous ? { ...previous, runs: previous.runs.map((r: any) => r.id === id ? run : r) } : previous);
    }).catch(e => setError(e.message)), 1500);
    return () => clearInterval(timer);
  }, [inspectRun?.id]);

  async function saveConfig(newEnabled = enabled, newTrigger = triggerMode, newAllowed = allowedPresets) {
    try {
      setStatus('Saving swarm configuration…');
      await act(async () => {
        await put(profilePath(p, `/swarms`), {
          enabled: newEnabled,
          trigger_mode: newTrigger,
          allowed_presets: newAllowed
        });
      });
      setStatus('Swarm settings saved and profile identity updated.');
      await load();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      setStatus('');
    }
  }

  function togglePreset(presetId: string) {
    const next = allowedPresets.includes(presetId)
      ? allowedPresets.filter(x => x !== presetId)
      : [...allowedPresets, presetId];
    setAllowedPresets(next);
    saveConfig(enabled, triggerMode, next);
  }

  async function handleDeploy(e: React.FormEvent) {
    e.preventDefault();
    if (!taskText.trim() || !deployPreset) return;
    setSubmitting(true);
    setError('');
    try {
      const run = await post(profilePath(p, `/swarms/spawn`), {
        preset: deployPreset,
        task: taskText.trim(),
        operation_id: deploymentId, machine_id: executionMachine || undefined,
        ...(deployPreset === 'custom' ? { custom_roles: JSON.parse(roles) } : {})
      });
      setDeployPreset(null);
      setTaskText('');
      await load();
      setInspectRun(run);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const presets: any[] = data?.presets || [];
  const runs: any[] = data?.runs || [];

  return <div className="swarm-surface">
    <div className="agent-intro" style={{marginBottom: 20}}>
      <div>
        <span className="agent-kicker">COORDINATED MULTI-AGENT EXECUTION</span>
        <h2>Swarm coordination for {p.name}</h2>
        <p>Deploy specialized worker teams working in tandem. Best for large, multi-stage tasks like research synthesis, full-stack coding architecture, or strategic analysis.</p>
        <div className="button-row">
          <button className={enabled ? 'primary' : ''} onClick={() => {
            const next = !enabled;
            setEnabled(next);
            saveConfig(next, triggerMode, allowedPresets);
          }}>
            {enabled ? <CheckCircle2 size={15} /> : <Circle size={15} />}
            {enabled ? 'Swarms enabled' : 'Enable swarms'}
          </button>
        </div>
      </div>
      <span className="agent-intro-icon sage">
        <Users size={62} strokeWidth={1} />
      </span>
    </div>

    {status && <div className="notice" role="status">{status}</div>}
    {error && <div className="notice warning" role="alert">{error}</div>}
    {data && <SwarmExecutionSettings profile={p} config={data.config} saved={load} />}

    <div className="two-columns" style={{marginBottom: 24}}>
      <section className="panel padded">
        <div className="section-title">
          <div>
            <h2>Triggering policy</h2>
            <p>Control when {p.name} is permitted to spawn a swarm of worker bots.</p>
          </div>
        </div>
        <label>
          Trigger mode
          <select value={triggerMode} onChange={e => {
            setTriggerMode(e.target.value);
            saveConfig(enabled, e.target.value, allowedPresets);
          }}>
            <option value="intelligent">Intelligent & Explicit (Auto-detect large tasks + explicit requests)</option>
            <option value="explicit">Explicit Only (Spawn swarms only when specifically invoked)</option>
          </select>
        </label>
        <p className="hint">
          {triggerMode === 'intelligent'
            ? 'The agent evaluates task complexity. Everyday queries are answered directly; large, multi-step tasks deploy a swarm.'
            : 'The agent will never spawn a swarm on its own. It only deploys worker swarms when you explicitly ask for one.'}
        </p>
      </section>

      <section className="panel padded">
        <div className="section-title">
          <div>
            <h2>Swarm status</h2>
            <p>Overview of active worker capabilities for this profile.</p>
          </div>
        </div>
        <div className="machine-facts">
          <span>Swarm state <strong>{enabled ? 'Active' : 'Disabled'}</strong></span>
          <span>Triggering <strong>{triggerMode === 'intelligent' ? 'Intelligent' : 'Explicit only'}</strong></span>
          <span>Allowed presets <strong>{allowedPresets.length} of {presets.length}</strong></span>
          <span>Recent executions <strong>{runs.length} runs</strong></span>
        </div>
      </section>
    </div>

    <div className="agent-section-label">
      <h2>Swarm Presets</h2>
      <span>Choose which specialized teams {p.name} can deploy.</span>
    </div>

    <div className="swarm-preset-grid">
      {presets.map(spec => {
        const isAllowed = allowedPresets.includes(spec.id);
        const Icon = spec.id === 'research' ? Compass : spec.id === 'coding' ? Code2 : spec.id === 'analysis' ? Activity : Bot;
        return <div className={`panel padded swarm-card ${isAllowed ? 'is-allowed' : ''}`} key={spec.id}>
          <div className="swarm-card-header">
            <div style={{display:'flex', alignItems:'center', gap:10}}>
              <span className="avatar sage"><Icon size={20} /></span>
              <div>
                <h3>{spec.name}</h3>
                <small>{spec.role}</small>
              </div>
            </div>
            <label className="swarm-toggle-label">
              <input type="checkbox" checked={isAllowed} onChange={() => togglePreset(spec.id)} />
              <span>{isAllowed ? 'Allowed' : 'Disabled'}</span>
            </label>
          </div>
          <p>{spec.description}</p>
          <div className="swarm-workers-tagline">
            <strong>Workers in tandem ({spec.workers?.length || 0}):</strong>
            <div className="specialist-capabilities">
              {spec.workers?.map((w: any) => <span key={w.id} title={w.objective}>{w.role}</span>)}
            </div>
          </div>
          <div className="swarm-card-actions">
            <button className="primary" disabled={!enabled || !isAllowed || !data?.deployments?.machines.some((m: any) => m.enabled && m.available)} onClick={() => { setDeploymentId(Array.from(crypto.getRandomValues(new Uint8Array(16)), v => v.toString(16).padStart(2, '0')).join('')); setExecutionMachine(data?.deployments?.primary_machine_id || ''); setDeployPreset(spec.id); }}>
              <Play size={14} /> Deploy swarm
            </button>
          </div>
        </div>;
      })}
    </div>

    <section className="panel padded" style={{marginTop: 26}}>
      <div className="section-title">
        <div>
          <h2>Recent Swarm Executions</h2>
          <p>Inspect multi-agent coordination, worker logs, and consolidated outputs.</p>
        </div>
      </div>
      {runs.length ? <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Preset</th>
              <th>Task</th>
              <th>Workers</th>
              <th>State</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {runs.map(r => <tr key={r.id}>
              <td><strong>{r.preset}</strong></td>
              <td className="truncate" style={{maxWidth: 320}}>{r.task}</td>
              <td>{r.workers?.length || 0} bots</td>
              <td><span className={`badge ${r.state === 'succeeded' ? 'good' : r.state === 'running' ? '' : 'warning'}`}><i />{r.state}</span></td>
              <td><small>{new Date(r.created_at).toLocaleString()}</small></td>
              <td><button className="text-button" onClick={() => setInspectRun(r)}>Inspect</button></td>
            </tr>)}
          </tbody>
        </table>
      </div> : <div className="empty">
        <Users size={25} strokeWidth={1.5} />
        <h3>No swarm runs yet</h3>
        <p>Deploy a swarm preset above or ask {p.name} in conversation to run a research, coding, or analysis swarm.</p>
      </div>}
    </section>

    {deployPreset && <div className="modal-backdrop">
      <div className="panel padded modal-dialog">
        <div className="section-title">
          <div>
            <h2>Deploy {presets.find(x => x.id === deployPreset)?.name || deployPreset}</h2>
            <p>Deploy a coordinated team of worker bots working in tandem on this task.</p>
          </div>
          <button className="icon-button" onClick={() => setDeployPreset(null)}><X size={18} /></button>
        </div>
        <form onSubmit={handleDeploy}>
          <label>Execution machine<select required value={executionMachine} onChange={e => setExecutionMachine(e.target.value)}>
            <option value="" disabled>Choose a deployed machine</option>
            {data?.deployments?.machines.filter((m: any) => m.enabled && m.available).map((m: any) =>
              <option key={m.machine_id} value={m.machine_id}>{m.machine_name}{m.online ? '' : ' · offline, work will queue'}</option>)}
          </select></label>
          <label>
            Task or problem for the swarm
            <textarea rows={5} required placeholder="Describe the task in detail. The swarm will break it down across specialized roles and synthesize the findings." value={taskText} onChange={e => setTaskText(e.target.value)} />
          </label>
          {deployPreset === 'custom' && <label>Worker roles and dependency stages (JSON)
            <textarea className="code" rows={7} required value={roles} onChange={e => setRoles(e.target.value)} />
            <small>Same-stage workers run concurrently in separate worktrees. Later stages inherit their artifacts.</small>
          </label>}
          <div className="button-row" style={{marginTop: 18}}>
            <button type="button" onClick={() => setDeployPreset(null)}>Cancel</button>
            <button className="primary" type="submit" disabled={submitting || !taskText.trim() || !executionMachine}>
              {submitting ? <Loader2 size={15} className="spin" /> : <Play size={15} />}
              Launch swarm
            </button>
          </div>
        </form>
      </div>
    </div>}

    {inspectRun && <div className="modal-backdrop">
      <div className="panel padded modal-dialog large">
        <div className="section-title">
          <div>
            <h2>Swarm run: {inspectRun.preset}</h2>
            <span className={`badge ${inspectRun.state === 'succeeded' ? 'good' : inspectRun.state === 'running' ? '' : 'warning'}`}><i />{inspectRun.state}</span>
          </div>
          <button className="icon-button" onClick={() => setInspectRun(null)}><X size={18} /></button>
        </div>
        <div className="native-record" style={{marginBottom: 16}}>
          <strong>Task:</strong>
          <p>{inspectRun.task}</p>
          <small>Execution owner: {inspectRun.owner_machine || 'legacy, inspect receipts'}</small>
          {['queued', 'running'].includes(inspectRun.state) && <button disabled={inspectRun.cancel_requested}
            onClick={() => post('/swarms/' + inspectRun.id + '/cancel', {}).then(setInspectRun).catch(e => setError(e.message))}>
            {inspectRun.cancel_requested ? 'Cancellation requested' : 'Request cancellation'}</button>}
          {inspectRun.error && <div className="notice warning">{inspectRun.error}</div>}
        </div>
        <h3>Worker Bots Working in Tandem</h3>
        <div className="swarm-workers-grid">
          {inspectRun.workers?.map((w: any) => <div className="swarm-worker-card" key={w.id}>
            <div className="swarm-worker-header">
              <strong>{w.role}</strong>
              <span className={`badge ${w.state === 'completed' ? 'good' : w.state === 'running' ? '' : 'warning'}`}><i />{w.state}</span>
            </div>
            <small className="objective-text"><strong>Objective:</strong> {w.objective}</small>
            {w.api_calls !== undefined && <small>Observed model calls: {w.api_calls} · tokens: {w.tokens?.input ?? 'unknown'} in / {w.tokens?.output ?? 'unknown'} out</small>}
            {w.output && <div className="worker-output-preview"><pre>{w.output}</pre></div>}
            {w.error && <div className="notice warning"><small>{w.error}</small></div>}
            {typeof w.workspace === 'string' && <small>Workspace: {w.workspace}</small>}
            {typeof w.native_session_id === 'string' && <small>Native session: {w.native_session_id}</small>}
            <small>Artifact collection: {typeof w.artifact_status === 'string' ? w.artifact_status.replaceAll('_', ' ') : 'not reported'}</small>
            {typeof w.artifact_error === 'string' && <div className="notice warning"><small>{w.artifact_error}</small></div>}
            {w.artifacts && <details><summary>Workspace evidence · not applied to the original repository</summary>
              <pre>{JSON.stringify(w.artifacts, null, 2).slice(0, 60000)}</pre></details>}
          </div>)}
        </div>
        {inspectRun.synthesis?.error && <div className="notice warning">Synthesis: {inspectRun.synthesis.error}</div>}
        {inspectRun.synthesized_output && <div style={{marginTop: 20}}>
          <h3>Consolidated Synthesis</h3>
          <div className="native-record">
            <pre style={{whiteSpace: 'pre-wrap'}}>{inspectRun.synthesized_output}</pre>
          </div>
        </div>}
        <div className="button-row" style={{marginTop: 20}}>
          <button onClick={() => setInspectRun(null)}>Close</button>
        </div>
      </div>
    </div>}
  </div>;
}

