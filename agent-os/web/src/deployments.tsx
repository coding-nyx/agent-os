import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronRight, Loader2, Monitor, Network, RefreshCw, Server } from 'lucide-react';
import { profilePath, api, Item, post } from './api';

export type MachineDeployment = { machine_id: string; machine_name: string; available: boolean; online: boolean;
  native_name: string; desired_enabled: boolean; enabled: boolean; state: string; error?: string;
  model_configured?: boolean; swarm_enabled?: boolean; confirmed_at?: number };
export type DeploymentSet = { profile_id: string; profile_name: string; revision: number; profile_enabled: boolean;
  primary_machine_id: string | null; machines: MachineDeployment[] };

export function desiredDeployments(profile: Item): { machine_id: string; native_name: string }[] {
  return Array.isArray(profile.deployments) ? profile.deployments.filter(d => d.enabled) :
    [profile.execution_placement || { machine_id: 'local', native_name: profile.native_name }];
}

export function deploymentLabel(row: MachineDeployment) {
  if (!row.online && row.state === 'active') return 'Last confirmed enabled';
  if (!row.online && row.state === 'disabled') return 'Last confirmed disabled';
  const names: Record<string, string> = { active: 'Enabled on machine', disabled: 'Disabled on machine',
    not_deployed: 'Not deployed', deploy_pending: 'Deployment pending', disable_pending: 'Disable pending', error: 'Needs attention' };
  return names[row.state] || row.state;
}

export function AgentDeployments({ profile, refresh }: { profile: Item; refresh: () => Promise<void> }) {
  const [definition, setDefinition] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);
  const [inventory, setInventory] = useState<any[]>([]);
  const [adoption, setAdoption] = useState('');
  const [data, setData] = useState<DeploymentSet | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [nativeName, setNativeName] = useState(profile.native_name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const alive = useRef(true);
  const load = useCallback(async () => {
    try {
      const next = await api<DeploymentSet>('/profiles/' + profile.id + '/deployments');
      if (alive.current) setData(previous => previous && previous.revision > next.revision ? previous : next);
      const [manifest, machines] = await Promise.all([api('/profiles/' + profile.id + '/definition'), api<Item[]>('/machines')]);
      if (alive.current) {
        setDefinition(manifest);
        setInventory(machines.flatMap(m => (m.instances || []).filter((i: any) => !i.logical_agent_id).map((i: any) => ({...i, machine_id:m.id, machine_name:m.name}))));
      }
    } catch (e) { if (alive.current) setError((e as Error).message); }
  }, [profile.id]);
  useEffect(() => {
    alive.current = true; load();
    const timer = setInterval(load, 5000);
    return () => { alive.current = false; clearInterval(timer); };
  }, [load]);
  async function apply(action: 'deploy' | 'undeploy' | 'primary', ids = selected) {
    if (!data || busy || !ids.length) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const next = await post<DeploymentSet>('/profiles/' + profile.id + '/deployments', {
        action, machine_ids: ids, revision: data.revision, ...(action === 'deploy' ? { native_name: nativeName } : {})
      });
      if (!alive.current) return;
      setData(next); setSelected([]);
      setMessage(action === 'primary' ? 'Default execution machine updated.' : action === 'deploy'
        ? `Deployment requested on ${ids.length} machine${ids.length === 1 ? '' : 's'}. Node confirmation appears below.`
        : `Undeploy requested on ${ids.length} machine${ids.length === 1 ? '' : 's'}. The agent is blocked from new managed work there.`);
      await refresh();
    } catch (e) { if (alive.current) setError((e as Error).message); }
    finally { if (alive.current) setBusy(false); }
  }
  const rows = data?.machines || [];
  const nodes = rows.filter(r => r.machine_id !== 'local' && r.available);
  const assigned = rows.filter(r => r.desired_enabled);
  return <section className="panel deployment-panel" aria-label={`Machine deployments for ${profile.name}`}>
    <header className="deployment-heading"><div><span className="agent-kicker">ONE AGENT · YOUR MACHINES</span>
      <h2>Deploy {profile.name}</h2><p>Choose where this agent is enabled. Each machine keeps its own model connection and working state.</p></div>
      <button aria-label="Refresh deployments" disabled={busy} onClick={load}><RefreshCw size={16} /></button></header>
    <div className="deployment-totals"><span><strong>{assigned.length}</strong> assigned machines</span>
      <span><strong>{rows.filter(r => r.state === 'active').length}</strong> confirmed enabled</span>
      <span><strong>{rows.filter(r => r.state.endsWith('_pending')).length}</strong> awaiting node confirmation</span></div>
    {!data && !error && <p role="status"><Loader2 size={16} className="spin" /> Loading machine deployments…</p>}
    {error && <div className="notice warning" role="alert">{error}<button onClick={() => { setError(''); load(); }}>Reload settings</button></div>}
    {message && <div className="notice" role="status">{message}</div>}
    {data && !data.profile_enabled && <div className="notice warning">This agent is paused globally. Deployments remain assigned; enable the agent to resume them.</div>}
    <div className="deployment-selection"><div className="button-row">
      <button disabled={busy || !nodes.length} onClick={() => setSelected(nodes.map(r => r.machine_id))}>Select all nodes</button>
      <button disabled={busy || !selected.length} onClick={() => setSelected([])}>Clear selection</button></div>
      <span>{selected.length} selected</span></div>
    <div className="deployment-machines">
      {rows.map(row => <article key={row.machine_id} className={'deployment-machine ' + (selected.includes(row.machine_id) ? 'is-selected' : '')}>
        <label className="deployment-choice"><input type="checkbox" aria-label={`Select ${row.machine_name}`}
          disabled={busy || (!row.available && !row.desired_enabled)} checked={selected.includes(row.machine_id)}
          onChange={e => setSelected(ids => e.target.checked ? [...ids, row.machine_id] : ids.filter(id => id !== row.machine_id))} />
          <span className="deployment-machine-icon">{row.machine_id === 'local' ? <Monitor size={21} /> : <Server size={21} />}</span>
          <span><strong>{row.machine_name}</strong><small>{row.machine_id === 'local' ? 'Host machine' : row.online ? 'Node online' : 'Node offline'}
            {row.desired_enabled && <> · {row.native_name}</>}</small></span></label>
        <div className="deployment-machine-state"><span className={'deployment-state ' + (row.state === 'active' ? 'is-enabled' : '')}>
          <i />{deploymentLabel(row)}</span>
          {row.error && <small className="error">{row.error}</small>}
          {(row as any).runtime_state && <small>Runtime: {(row as any).runtime_state.replaceAll('_',' ')}</small>}
          {(row as any).definition_sync?.state === 'conflict' && <small>Definition conflict: {(row as any).definition_sync.conflicts.join(', ')}</small>}
          {(row as any).definition_sync?.state === 'local_changes' && <small>Local definition edits · publish this instance to share them</small>}
          {row.state === 'active' && row.machine_id !== 'local' && row.model_configured === false && <small>Model setup needed on this node</small>}
          {!row.online && row.state.endsWith('_pending') && <small>Applies when the node reconnects</small>}</div>
        <div className="deployment-machine-actions">{row.desired_enabled && data?.primary_machine_id === row.machine_id
          ? <span className="deployment-default"><CheckCircle2 size={13} /> Default execution</span>
          : row.desired_enabled && <button disabled={busy || !row.available} onClick={() => apply('primary', [row.machine_id])}>Use by default</button>}
          {row.desired_enabled && <button disabled={busy} onClick={() => apply('undeploy', [row.machine_id])}>Undeploy</button>}</div>
      </article>)}
    </div>
    {!nodes.length && <p className="hint">Pair a machine in Machines &amp; sync to deploy this agent to a node.</p>}
    <section className="padded" aria-label="Profile definition sync">
      <h3>Published profile definition</h3><p className="hint">Identity, instructions and skill files are versioned. Model accounts, memory, sessions, channels and machine grants remain with each instance.</p>
      <p>{definition?.revision ? `Revision ${definition.revision.slice(0, 12)} · published from ${definition.owner_machine}` : 'No published revision yet'}</p>
      <div className="button-row"><button disabled={busy || !profile._runtime_target} onClick={async () => {
        setBusy(true); setError(''); try { await post(profilePath(profile, '/definition/publish'), {revision:definition?.revision}); setMessage('Published the selected instance’s current definition. Nodes will compare it with their local files.'); await load(); } catch(e) {setError((e as Error).message);} finally {setBusy(false);}
      }}>Publish selected instance</button><button disabled={busy || !definition?.revision || !profile._runtime_target} onClick={async () => {
        setBusy(true); setError(''); try {setPreview(await post(profilePath(profile, '/definition/preview'), {}));} catch(e) {setError((e as Error).message);} finally {setBusy(false);}
      }}>Review published changes</button></div>
      {preview && <div className="notice"><strong>Apply published definition to {profile._runtime_target?.machine_name}</strong>
        <p>This replaces changed definition files on this instance. Review identity and skills before applying.</p>
        <ul>{preview.changes.map((c:any) => <li key={c.path}>{c.action} · {c.path}</li>)}</ul>{preview.config_changed && <p>Portable native configuration also changes.</p>}
        <div className="button-row"><button onClick={() => setPreview(null)}>Close review</button><button disabled={busy} onClick={async () => {setBusy(true); try {await post(profilePath(profile, '/definition/apply'), preview);setPreview(null);setMessage('Published definition applied to the selected instance.');await load();} catch(e) {setError((e as Error).message);} finally {setBusy(false);}}}>Apply reviewed changes</button></div>
      </div>}
      {inventory.length > 0 && <details><summary>Adopt an existing standalone instance</summary><p className="hint">Pairing keeps existing instances independent. Adoption links the selected native instance to this agent; its credentials and sessions stay on that node. Conflicting files require review.</p>
        <label>Standalone instance<select value={adoption} onChange={e => setAdoption(e.target.value)}><option value="">Choose an instance</option>{inventory.map(i => <option key={i.instance_id} value={i.instance_id}>{i.machine_name} · {i.native_name} · {i.instance_id.slice(0,8)}</option>)}</select></label>
        <button disabled={!adoption || busy} onClick={async () => {const instance=inventory.find(i=>i.instance_id===adoption);if(!instance||!data)return;setBusy(true);try {await post('/profiles/'+profile.id+'/deployments',{action:'adopt',machine_ids:[instance.machine_id],instance_id:instance.instance_id,revision:data.revision});setAdoption('');await load();await refresh();} catch(e) {setError((e as Error).message);} finally {setBusy(false);}}}>Adopt selected instance</button>
      </details>}
    </section>
    <footer className="deployment-footer"><details><summary>Profile name for new deployments</summary>
      <label>Native profile name<input value={nativeName} onChange={e => setNativeName(e.target.value)} maxLength={64}
        pattern="[a-z0-9][a-z0-9_-]{0,63}" disabled={busy} /></label>
      <p className="hint">Choose an unused native profile name for a new deployment. Use explicit adoption to link an existing standalone instance.</p></details>
      <div className="button-row"><button disabled={busy || !selected.some(id => rows.find(r => r.machine_id === id)?.desired_enabled)} onClick={() => apply('undeploy')}>Undeploy selected</button>
        <button className="primary" disabled={busy || !selected.length || selected.some(id => !rows.find(r => r.machine_id === id)?.available) || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(nativeName)}
          onClick={() => apply('deploy')}>{busy ? <Loader2 size={15} className="spin" /> : <Network size={15} />}Deploy to selected</button></div></footer>
    <p className="deployment-note">Undeploy disables this agent on the selected machines and requests cancellation of its managed work. Its files and history are kept. Other agents and the node connection stay enabled.</p>
  </section>;
}

export function MachineAgentDeployments({ open }: { open: (id: string) => void }) {
  const [data, setData] = useState<DeploymentSet[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    const load = () => api<DeploymentSet[]>('/deployments').then(d => { if (!cancelled) { setData(d); setError(''); } })
      .catch(e => { if (!cancelled) setError(e.message); });
    load(); const timer = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);
  return <section className="panel deployment-panel" style={{ marginBottom: 24 }}>
    <header className="deployment-heading"><div><span className="agent-kicker">DEPLOYMENT DIRECTORY</span>
      <h2>Agents across your machines</h2><p>See every agent’s assignments and the latest node-confirmed state.</p></div><Network size={22} /></header>
    {error && <div role="alert" className="notice warning">{error}</div>}
    <div className="deployment-directory">{data.map(p => <button key={p.profile_id} onClick={() => open(p.profile_id)}>
      <strong>{p.profile_name}</strong><span>{p.machines.filter(m => m.desired_enabled || ['disable_pending', 'error'].includes(m.state)).map(m =>
        <span className="deployment-directory-machine" key={m.machine_id}>{m.machine_name}<small>{deploymentLabel(m)}{!m.online ? ' · offline' : ''}</small></span>)}
        {!p.machines.some(m => m.desired_enabled) && <small>No assigned machines</small>}</span><ChevronRight size={16} /></button>)}</div>
  </section>;
}
