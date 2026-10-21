import React, { useEffect, useRef, useState } from 'react';
import { Camera, Lock, Monitor, RefreshCw, Shield, Unlock } from 'lucide-react';
import { operationId, api, computerToken, post, put } from './api';
import './system_control.css';
import { ComputerSetup } from './computer_setup';

type Policy = { mode: 'view_only' | 'supervised' | 'autonomous'; kill_switch: boolean; grants: Record<string, string[]>; epoch: number;
  remote?: boolean; remote_access?: string[]; local_kill_switch?: boolean; online?: boolean; setup_supported?: boolean };

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
  const [deviceId, setDeviceId] = useState('local_desktop');
  const [inputPending, setInputPending] = useState(false);
  const [observationReady, setObservationReady] = useState(false);
  const [typedText, setTypedText] = useState('');
  const image = useRef<HTMLImageElement>(null);
  const generation = useRef(0);
  const observationId = useRef<string | undefined>(undefined);
  const pendingObservationId = useRef<string | undefined>(undefined);
  const inputLock = useRef(false);
  const device = devices.find(d => d.id === deviceId);
  const remote = deviceId.startsWith('node:');
  const machineId = remote ? deviceId.slice(5) : 'local';
  const scope = '?machine_id=' + encodeURIComponent(machineId);
  const unavailable = !device || ['unavailable', 'offline', 'disabled'].includes(device.state);
  const canInput = !unavailable && !!policy && policy.mode !== 'view_only' && !policy.kill_switch &&
    (!remote || !!policy.remote_access?.includes('input')) && observationReady && !inputPending;

  function selectDevice(id: string) {
    generation.current++;
    observationId.current = undefined;
    pendingObservationId.current = undefined;
    setObservationReady(false); setTypedText(''); setActor('');
    setDeviceId(id); setFrame(null); setTree(null); setPolicy(null); setApprovals([]);
    setObserving(false); setConnected(false); setError('');
  }

  function showFrame(data: string, format: string, id?: string) {
    const source = 'data:image/' + (format === 'jpeg' || format === 'jpg' ? 'jpeg' : 'png') + ';base64,' + data;
    pendingObservationId.current = id;
    // Wait for the browser to display the new pixels before authorizing a click.
    observationId.current = image.current?.complete && image.current.currentSrc === source ? id : undefined;
    setObservationReady(!!observationId.current);
    setFrame(source);
  }

  async function refresh() {
    const version = generation.current;
    try {
      const [d, p, a] = await Promise.all([api('/cua/devices'), api('/cua/state' + scope), api('/cua/approvals' + scope)]);
      if (version !== generation.current) return;
      setDevices(d); setPolicy(p); setApprovals(a); setError('');
    } catch (e) { if (version === generation.current) setError((e as Error).message); }
  }
  useEffect(() => {
    api('/profiles').then(setProfiles).catch(e => setError(e.message));
  }, []);
  useEffect(() => {
    let cancelled = false;
    const version = generation.current;
    refresh();
    const timer = setInterval(() => {
      Promise.all([api('/cua/state' + scope), api('/cua/approvals' + scope)]).then(([p, a]) => {
        if (cancelled || version !== generation.current) return;
        setPolicy(p); setApprovals(a);
      }).catch(e => { if (!cancelled && version === generation.current) setError(e.message); });
    }, 2000);
    const deviceTimer = setInterval(() => {
      api('/cua/devices').then(d => { if (!cancelled && version === generation.current) setDevices(d); })
        .catch(e => { if (!cancelled && version === generation.current) setError(e.message); });
    }, 5000);
    return () => { cancelled = true; clearInterval(timer); clearInterval(deviceTimer); };
  }, [deviceId]);

  useEffect(() => {
    if (!observing || !device) return;
    let cancelled = false;
    const version = generation.current;
    let socket: WebSocket | null = null;
    computerToken().then(token => {
      if (cancelled) return;
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(protocol + '//' + location.host + '/api/v1/cua/devices/' + device.id + '/stream', ['ara-control', token]);
      socket.onopen = () => { if (!cancelled && version === generation.current) setConnected(true); };
      socket.onclose = () => { if (!cancelled && version === generation.current) { setConnected(false); setObserving(false); } };
      socket.onerror = () => { if (!cancelled && version === generation.current) setError('Observation connection failed. No device readiness is assumed.'); };
      socket.onmessage = event => {
        if (cancelled || version !== generation.current) return;
        const msg = JSON.parse(event.data);
        if (msg.type === 'frame') {
          showFrame(msg.data, msg.format, msg.observation_id);
        }
        if (msg.type === 'error') setError(msg.message);
      };
    }).catch(e => { if (!cancelled && version === generation.current) setError(e.message); });
    return () => { cancelled = true; socket?.close(); setConnected(false); };
  }, [observing, device?.id]);

  async function update(values: Partial<Policy>) {
    const version = generation.current;
    try {
      const next = await put<Policy>('/cua/state' + scope, values);
      if (version === generation.current) { setPolicy(next); setError(''); }
    } catch (e) { if (version === generation.current) setError((e as Error).message); }
  }

  async function snapshot() {
    if (!device) return;
    const version = generation.current;
    try {
      const result = await post<any>('/cua/devices/' + device.id + '/action', { action: 'screenshot' });
      if (version !== generation.current) return;
      if (!result.success) throw new Error(result.error || 'Capture unavailable');
      if (!result.frame_base64) throw new Error('Capture returned no image');
      showFrame(result.frame_base64, result.metadata?.format, result.metadata?.observation_id);
      setError('');
    } catch (e) { if (version === generation.current) setError((e as Error).message); }
  }

  async function sendInput(action: Record<string, unknown>) {
    if (inputLock.current || !canInput || !device || !observationId.current) return;
    const version = generation.current;
    inputLock.current = true; setInputPending(true);
    setObserving(false);
    let delivered = false;
    try {
      const result = await post<any>('/cua/devices/' + device.id + '/action', {
        ...action,
        operation_id: operationId(),
        observation_id: observationId.current
      });
      if (version !== generation.current) return;
      if (!result.success) throw new Error(result.error || 'Input was not confirmed');
      delivered = true;
      observationId.current = undefined; setObservationReady(false);
      await snapshot();
      if (version !== generation.current) return;
      if (result.metadata?.effect !== 'confirmed' && result.metadata?.verified !== true)
        setError('Input was delivered; its effect is unconfirmed. Inspect the snapshot before another action.');
    } catch (e) { if (version === generation.current) setError((e as Error).message); }
    finally {
      inputLock.current = false; setInputPending(false);
      if (!delivered && version === generation.current) { observationId.current = undefined; setObservationReady(false); }
    }
    return delivered;
  }

  async function click(e: React.MouseEvent<HTMLImageElement>) {
    if (!image.current) return;
    const rect = image.current.getBoundingClientRect();
    await sendInput({ action: 'left_click', coordinate: [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height] });
  }

  async function approve(id: string) {
    const version = generation.current;
    try {
      const result = await post<any>('/cua/approvals/' + id + '/approve' + scope, {});
      if (version !== generation.current) return;
      if (!result.success) throw new Error(result.error || 'Action was not confirmed');
      await refresh();
    } catch (e) { if (version === generation.current) setError((e as Error).message); }
  }

  async function reject(id: string) {
    const version = generation.current;
    try {
      await post('/cua/approvals/' + id + '/reject' + scope, {});
      if (version === generation.current) await refresh();
    } catch (e) { if (version === generation.current) setError((e as Error).message); }
  }

  async function inspect() {
    if (!device) return;
    const version = generation.current;
    try {
      const value = await api('/cua/devices/' + device.id + '/ui-tree');
      if (version === generation.current) setTree(value);
    } catch (e) { if (version === generation.current) setError((e as Error).message); }
  }

  return <div className="system-control-shell">
    <div className="sc-header">
      <div><div className="eyebrow">CONNECTED DEVICES · EXPLICIT AUTHORITY</div>
        <h1>System Control</h1><p>Native desktop observation and policy-gated input. OS scripting is a separate permission.</p></div>
      <button className={'sc-kill-switch-btn ' + (policy?.kill_switch ? 'is-active' : '')}
        disabled={!policy || policy.local_kill_switch} onClick={() => update({ kill_switch: !policy?.kill_switch })}>
        {policy?.kill_switch ? <Lock size={16} /> : <Unlock size={16} />}
        {policy?.local_kill_switch ? 'Stopped locally on node' : policy?.kill_switch ? 'Paused — resume managed inputs' : 'Stop managed inputs'}
      </button>
    </div>
    {error && <div className="notice warning" role="alert">{error}</div>}
    <label>Desktop<select aria-label="Desktop" value={deviceId} onChange={e => selectDevice(e.target.value)}>
      {devices.map(d => <option key={d.id} value={d.id}>{d.name} · {d.state}</option>)}
    </select></label>
    <ComputerSetup key={deviceId} machineId={machineId} device={device} policy={policy} update={update} refresh={refresh} />
    <div className="notice">{remote ? 'Controls apply to the selected node. Permission dialogs appear on that computer. ' : 'Local desktop selected. '}
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
            <button key={mode} disabled={!policy || (remote && !policy.setup_supported)} className={policy?.mode === mode ? 'active' : ''}
              aria-pressed={policy?.mode === mode}
              onClick={() => update({ mode })}>{mode.replaceAll('_', ' ')}</button>)}
          <button onClick={() => setObserving(!observing)} disabled={unavailable && !observing}>
            {observing ? 'Stop observation' : 'Start observation'}</button>
          <button onClick={snapshot} disabled={unavailable || inputPending}><Camera size={14} /> Snapshot</button>
          {inputPending && <span role="status">Waiting for input receipt…</span>}
        </div>
        <div className="sc-canvas-container">
          {frame ? <img ref={image} src={frame} alt="Observed target window. Click to send operator input when enabled."
            onLoad={e => { if (e.currentTarget.currentSrc === frame) { observationId.current = pendingObservationId.current; setObservationReady(!!observationId.current); } }}
            onError={() => { observationId.current = undefined; setObservationReady(false); setFrame(null); setError('The selected desktop returned an unreadable image.'); }}
            className="sc-stream-image" onClick={click} /> :
            <div className="sc-placeholder" style={{padding:'24px 20px', textAlign:'center', maxWidth:460, margin:'0 auto'}}>
              <Monitor size={40} strokeWidth={1.4} style={{color:'#7b847d', marginBottom:12}} />
              <h2>No screen captured</h2>
              <p style={{fontSize:12, lineHeight:1.6, marginBottom:16}}>
                {device?.metadata?.detail || 'Start observation or take a snapshot explicitly.'}
              </p>
              {remote ? <div className="notice"><strong>On the selected node</strong>
                <p>Run these commands in its graphical login session, then take a snapshot here.</p>
                <pre className="command-example">ara setup --computer-control{'\n'}ara cua remote --allow-view --allow-input --mode supervised{'\n'}ara node work</pre>
                <p>Agent permissions are separate. On that node, grant the deployed native profile with <code>ara cua configure --profile NATIVE_NAME --allow-view --allow-input --mode supervised</code>.</p>
              </div> : <div style={{background:'#f3f6ef', border:'1px solid #dfe5da', borderRadius:8, padding:'12px 14px', textAlign:'left', fontSize:12, lineHeight:1.6}}>
                <strong style={{color:'#2e4835', display:'block', marginBottom:4}}>How to provide and configure access:</strong>
                <ol style={{margin:'4px 0 0', paddingLeft:18, color:'#4a5b4e'}}>
                  <li style={{marginBottom:4}}><strong>Grant an Agent:</strong> In the <em>Agent permissions</em> panel on the right, pick an agent (e.g. <code>Ara</code>), choose <em>Observe only</em> or <em>Observe and input</em>, then click <em>Save permission</em>.</li>
                  <li style={{marginBottom:4}}><strong>Set Mode:</strong> Switch from <em>view only</em> to <em>supervised</em> (recommended; requires 1-click operator approvals) or <em>autonomous</em> using the mode buttons above.</li>
                  <li style={{marginBottom:4}}><strong>Verify Display:</strong> Click the <strong>Snapshot</strong> button above to verify display access and capture a test frame.</li>
                  <li><strong>Driver installation:</strong> If the native driver is ever missing, run in terminal: <code>ara setup --computer-control</code>.</li>
                </ol>
              </div>}
            </div>}
        </div>
        <div className="sc-input-controls">
          <form onSubmit={async e => { e.preventDefault(); if (await sendInput({ action: 'type', text: typedText })) setTypedText(''); }}>
            <label htmlFor="desktop-text">Type into the observed window</label>
            <textarea id="desktop-text" value={typedText} onChange={e => setTypedText(e.target.value)} maxLength={20000}
              rows={2} placeholder="Text to send to the focused field" disabled={inputPending} />
            <button disabled={!canInput || !typedText}>Send text</button>
          </form>
          <div className="button-row" aria-label="Desktop keys">
            {['Enter', 'Tab', 'Escape', 'Backspace'].map(key => <button key={key} disabled={!canInput}
              onClick={() => sendInput({ action: 'key', keys: [key.toLowerCase()] })}>{key}</button>)}
            <button disabled={!canInput} onClick={() => sendInput({ action: 'scroll', scroll_delta: [0, 3] })}>Scroll up</button>
            <button disabled={!canInput} onClick={() => sendInput({ action: 'scroll', scroll_delta: [0, -3] })}>Scroll down</button>
          </div>
          <small>{canInput ? 'Inputs use the displayed observation. Sending input pauses live observation.' :
            'Take a fresh snapshot and enable input on this desktop to use these controls.'}</small>
        </div>
        <div className="sc-viewport-footer"><small>{policy?.mode === 'view_only' ? 'View only: backend rejects all input.' :
          policy?.mode === 'supervised' ? 'Supervised: agent inputs require operator approval; your clicks are explicit operator actions.' :
          'Autonomous: only explicitly granted agents may send input. Workers do not inherit computer grants.'}</small></div>
      </section>
      <aside className="sc-sidebar-column">
        <section className="panel padded"><div className="section-title"><h2>Agent permissions</h2><Shield size={18} /></div>
          <p>{remote ? 'These grants apply to assigned agents on this node. macOS permissions are requested separately above.' : 'No profile has desktop authority by default.'}</p>
          {(!remote || policy?.setup_supported) && <form onSubmit={e => { e.preventDefault(); if (actor && policy) update({
            grants: { ...policy.grants, [actor]: permission === 'none' ? [] : permission === 'input' ? ['view', 'input'] : ['view'] }
          }); }}>
            <label>Agent<select aria-label="Agent" required value={actor} onChange={e => setActor(e.target.value)}>
              <option value="">Choose an agent</option>{profiles.filter(p => !remote || p.deployments?.some((d: any) => d.machine_id === machineId && d.enabled)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label>Authority<select aria-label="Authority" value={permission} onChange={e => setPermission(e.target.value)}>
              <option value="view">Observe only</option><option value="input">Observe and input</option><option value="none">Revoke access</option></select></label>
            <button className="primary" disabled={!actor || !policy}>Save permission</button>
          </form>}
          {Object.entries(policy?.grants || {}).map(([id, grants]) => <p key={id}>
            {profiles.find(p => p.id === id)?.name || id}: {grants.join(', ') || 'revoked'}</p>)}
        </section>
        <section className="panel padded" style={{ marginTop: 20 }}><h2>Pending input approvals</h2>
          {approvals.length ? approvals.map(a => <div className="sc-script-output" key={a.id}>
            <strong>{profiles.find(p => p.id === a.actor)?.name || a.actor}</strong>
            <pre>{JSON.stringify(a.action, null, 2)}</pre><button disabled={unavailable || policy?.mode === 'view_only' || policy?.kill_switch || (remote && !policy?.remote_access?.includes('input'))}
              onClick={() => approve(a.id)}>Approve once</button>
            <button disabled={unavailable} onClick={() => reject(a.id)}>Reject</button>
          </div>) : <p className="hint">No pending computer actions.</p>}
        </section>
        <section className="panel padded" style={{ marginTop: 20 }}><h2>Accessibility inspection</h2>
          <button disabled={unavailable} onClick={inspect}>Inspect target window</button>
          {tree && <pre className="sc-script-output">{JSON.stringify(tree, null, 2)}</pre>}
        </section>
      </aside>
    </div>
  </div>;
}
