import React, { useEffect, useRef, useState } from 'react';
import { Camera, Lock, Monitor, RefreshCw, Shield, Unlock } from 'lucide-react';
import { api, computerToken, post, put } from './api';
import './system_control.css';

type Policy = { mode: 'view_only' | 'supervised' | 'autonomous'; kill_switch: boolean; grants: Record<string, string[]>; epoch: number };

export function SystemControlView() {
  const [devices, setDevices] = useState<any[]>([]);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [actor, setActor] = useState('');
  const [permission, setPermission] = useState('view');
  const [approvals, setApprovals] = useState<any[]>([]);
  const [frame, setFrame] = useState<string | null>(null);
  const [observing, setObserving] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [tree, setTree] = useState<any>(null);
  const image = useRef<HTMLImageElement>(null);
  const device = devices[0];

  async function refresh() {
    try {
      const [d, p, a] = await Promise.all([api('/cua/devices'), api('/cua/state'), api('/cua/approvals')]);
      setDevices(d); setPolicy(p); setApprovals(a); setError('');
    } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => {
    refresh();
    api('/profiles').then(setProfiles).catch(e => setError(e.message));
    const timer = setInterval(() => {
      Promise.all([api('/cua/state'), api('/cua/approvals')]).then(([p, a]) => {
        setPolicy(p); setApprovals(a);
      }).catch(e => setError(e.message));
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!observing || !device) return;
    let cancelled = false;
    let socket: WebSocket | null = null;
    computerToken().then(token => {
      if (cancelled) return;
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(protocol + '//' + location.host + '/api/v1/cua/devices/' + device.id + '/stream', ['ara-control', token]);
      socket.onopen = () => setConnected(true);
      socket.onclose = () => setConnected(false);
      socket.onerror = () => setError('Observation connection failed. No device readiness is assumed.');
      socket.onmessage = event => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'frame') setFrame('data:image/' + (msg.format === 'jpeg' ? 'jpeg' : 'png') + ';base64,' + msg.data);
        if (msg.type === 'error') setError(msg.message);
      };
    }).catch(e => setError(e.message));
    return () => { cancelled = true; socket?.close(); setConnected(false); };
  }, [observing, device?.id]);

  async function update(values: Partial<Policy>) {
    try { setPolicy(await put('/cua/state', values)); setError(''); }
    catch (e) { setError((e as Error).message); }
  }

  async function snapshot() {
    if (!device) return;
    try {
      const result = await post<any>('/cua/devices/' + device.id + '/action', { action: 'screenshot' });
      if (!result.success) throw new Error(result.error || 'Capture unavailable');
      setFrame('data:image/' + (result.metadata?.format === 'jpeg' ? 'jpeg' : 'png') + ';base64,' + result.frame_base64);
      setError('');
    } catch (e) { setError((e as Error).message); }
  }

  async function click(e: React.MouseEvent<HTMLImageElement>) {
    if (!device || !policy || policy.mode === 'view_only' || policy.kill_switch || !image.current) return;
    const rect = image.current.getBoundingClientRect();
    try {
      const result = await post<any>('/cua/devices/' + device.id + '/action', {
        action: 'left_click', coordinate: [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height]
      });
      if (!result.success) throw new Error(result.error || 'Input was not confirmed');
      await snapshot();
    } catch (e) { setError((e as Error).message); }
  }

  async function approve(id: string) {
    try {
      const result = await post<any>('/cua/approvals/' + id + '/approve', {});
      if (!result.success) throw new Error(result.error || 'Action was not confirmed');
      await refresh();
    } catch (e) { setError((e as Error).message); }
  }

  return <div className="system-control-shell">
    <div className="sc-header">
      <div><div className="eyebrow">LOCAL DEVICE · EXPLICIT AUTHORITY</div>
        <h1>System Control</h1><p>Native desktop observation and policy-gated input. OS scripting is a separate permission.</p></div>
      <button className={'sc-kill-switch-btn ' + (policy?.kill_switch ? 'is-active' : '')}
        disabled={!policy} onClick={() => update({ kill_switch: !policy?.kill_switch })}>
        {policy?.kill_switch ? <Lock size={16} /> : <Unlock size={16} />}
        {policy?.kill_switch ? 'Paused — resume managed inputs' : 'Stop managed inputs'}
      </button>
    </div>
    {error && <div className="notice warning" role="alert">{error}</div>}
    <div className="notice">Only this machine’s desktop is exposed here. Remote-node desktop routing and Android are not enabled.
      Stopping interrupts managed transports; it cannot undo an OS action already delivered.</div>
    <div className="sc-grid">
      <section className="panel sc-viewport-panel">
        <div className="sc-viewport-header"><div className="sc-stream-meta"><Monitor size={17} />
          <strong>{device?.name || 'Checking native driver…'}</strong><span>{device?.state || 'unknown'}</span>
          <span>{connected ? 'Observation connected' : 'Observation stopped'}</span></div>
          <button onClick={refresh} aria-label="Refresh device readiness"><RefreshCw size={15} /></button>
        </div>
        <div className="sc-stream-tools" style={{ padding: 12 }}>
          {(['view_only', 'supervised', 'autonomous'] as const).map(mode =>
            <button key={mode} disabled={!policy} className={policy?.mode === mode ? 'active' : ''}
              aria-pressed={policy?.mode === mode}
              onClick={() => update({ mode })}>{mode.replaceAll('_', ' ')}</button>)}
          <button onClick={() => setObserving(!observing)} disabled={!device || device.state === 'unavailable'}>
            {observing ? 'Stop observation' : 'Start observation'}</button>
          <button onClick={snapshot} disabled={!device || device.state === 'unavailable'}><Camera size={14} /> Snapshot</button>
        </div>
        <div className="sc-canvas-container">
          {frame ? <img ref={image} src={frame} alt="Observed target window. Click to send operator input when enabled."
            className="sc-stream-image" onClick={click} /> :
            <div className="sc-placeholder"><Monitor size={40} /><h2>No screen captured</h2>
              <p>{device?.metadata?.detail || 'Start observation or take a snapshot explicitly.'}</p></div>}
        </div>
        <div className="sc-viewport-footer"><small>{policy?.mode === 'view_only' ? 'View only: backend rejects all input.' :
          policy?.mode === 'supervised' ? 'Supervised: agent inputs require operator approval; your clicks are explicit operator actions.' :
          'Autonomous: only explicitly granted agents may send input. Workers do not inherit computer grants.'}</small></div>
      </section>
      <aside className="sc-sidebar-column">
        <section className="panel padded"><div className="section-title"><h2>Agent permissions</h2><Shield size={18} /></div>
          <p>No profile has desktop authority by default.</p>
          <form onSubmit={e => { e.preventDefault(); if (actor && policy) update({
            grants: { ...policy.grants, [actor]: permission === 'none' ? [] : permission === 'input' ? ['view', 'input'] : ['view'] }
          }); }}>
            <label>Agent<select aria-label="Agent" required value={actor} onChange={e => setActor(e.target.value)}>
              <option value="">Choose an agent</option>{profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label>Authority<select aria-label="Authority" value={permission} onChange={e => setPermission(e.target.value)}>
              <option value="view">Observe only</option><option value="input">Observe and input</option><option value="none">Revoke access</option></select></label>
            <button className="primary" disabled={!actor || !policy}>Save permission</button>
          </form>
          {Object.entries(policy?.grants || {}).map(([id, grants]) => <p key={id}>
            {profiles.find(p => p.id === id)?.name || id}: {grants.join(', ') || 'revoked'}</p>)}
        </section>
        <section className="panel padded" style={{ marginTop: 20 }}><h2>Pending input approvals</h2>
          {approvals.length ? approvals.map(a => <div className="sc-script-output" key={a.id}>
            <strong>{profiles.find(p => p.id === a.actor)?.name || a.actor}</strong>
            <pre>{JSON.stringify(a.action, null, 2)}</pre><button disabled={policy?.mode === 'view_only' || policy?.kill_switch}
              onClick={() => approve(a.id)}>Approve once</button>
            <button onClick={() => post('/cua/approvals/' + a.id + '/reject', {}).then(refresh).catch(e => setError(e.message))}>Reject</button>
          </div>) : <p className="hint">No pending computer actions.</p>}
        </section>
        <section className="panel padded" style={{ marginTop: 20 }}><h2>Accessibility inspection</h2>
          <button disabled={!device || device.state === 'unavailable'} onClick={() =>
            api('/cua/devices/' + device.id + '/ui-tree').then(setTree).catch(e => setError(e.message))}>Inspect target window</button>
          {tree && <pre className="sc-script-output">{JSON.stringify(tree, null, 2)}</pre>}
        </section>
      </aside>
    </div>
  </div>;
}
