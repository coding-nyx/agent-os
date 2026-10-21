import { useEffect, useState } from 'react';
import { CheckCircle2, Download, Loader2, RefreshCw, Shield } from 'lucide-react';
import { api, operationId, post } from './api';
import './computer_setup.css';

type Setup = { supported: boolean; online: boolean; platform: string; diagnostics?: Record<string, any> | null };
type Policy = { remote_access?: string[]; setup_supported?: boolean; online?: boolean };
const permission = (value: unknown) => value === true ? 'Granted' : value === false ? 'Permission needed' : 'Not checked';

export function ComputerSetup({ machineId, device, policy, update, refresh }: {
  machineId: string; device: any; policy: Policy | null;
  update: (values: Record<string, any>) => Promise<unknown>; refresh: () => Promise<unknown>;
}) {
  const remote = machineId !== 'local';
  const scope = '?machine_id=' + encodeURIComponent(machineId);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    api<Setup>('/cua/setup' + scope).then(value => { if (alive) setSetup(value); })
      .catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [scope, policy?.setup_supported, policy?.online]);
  const diagnostic = setup?.diagnostics || device?.metadata || {};
  const mac = ['darwin', 'macos'].includes(setup?.platform || device?.platform);
  const supported = !!setup?.supported;
  const enabled = supported && (!remote || setup?.online);
  const access = policy?.remote_access || [];
  async function run(action: string) {
    setBusy(action); setError(''); setMessage('');
    try {
      const result = await post<any>('/cua/setup' + scope, { action, operation_id: operationId() });
      if (result.diagnostics) setSetup(value => value && ({ ...value, diagnostics: result.diagnostics }));
      if (!result.success) throw new Error(result.error || 'Desktop setup was not confirmed');
      setMessage(result.detail || (action === 'check' ? 'Driver and permission checks completed. Take a snapshot to verify capture.' : 'Driver setup completed. Check permissions next.'));
      await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  }
  async function toggle(view: boolean, input: boolean) {
    setBusy('access');
    try { await update({ remote_access: view ? input ? ['view', 'input'] : ['view'] : [] }); }
    finally { setBusy(''); }
  }
  return <section className="panel computer-setup" aria-label="Desktop setup and permissions">
    <header><div><span className="eyebrow">DESKTOP ACCESS</span><h2>Set up {remote ? device?.name?.replace(' · node desktop', '') || 'this node' : 'this computer'}</h2></div><Shield size={20} /></header>
    <p>Check the driver already installed on this machine, allow system access, then choose who can observe or control it.</p>
    {!supported && remote && <div className="notice">Update this node in Machines &amp; sync to enable guided setup. Its existing driver will be kept.</div>}
    {setup && remote && !setup.online && <div className="notice">Reconnect the node worker to check or change its desktop setup.</div>}
    <div className="computer-setup-checks">
      <div><small>Desktop driver</small><strong>{diagnostic.installed === true ? 'Detected' : diagnostic.installed === false ? 'Not detected by this worker' : 'Not checked'}</strong></div>
      {mac && <><div><small>Screen Recording</small><strong>{permission(diagnostic.screen_recording)}</strong></div>
        <div><small>Accessibility</small><strong>{permission(diagnostic.accessibility)}</strong></div></>}
    </div>
    {error && <div className="notice warning" role="alert">{error}</div>}
    {message && <div className="notice" role="status">{message}</div>}
    <div className="button-row">
      <button type="button" disabled={!enabled || !!busy} onClick={() => run('check')}>{busy === 'check' ? <Loader2 className="spin" size={15} /> : <RefreshCw size={15} />}Check driver &amp; permissions</button>
      {mac && <button type="button" disabled={!enabled || !!busy || diagnostic.installed !== true} onClick={() => run('request_permissions')}><Shield size={15} />Request macOS permissions</button>}
      {diagnostic.installed === false && <button type="button" disabled={!enabled || !!busy} onClick={() => run('install')}><Download size={15} />Install managed driver</button>}
    </div>
    {mac ? <p>The permission request opens on this Mac. In <strong>System Settings → Privacy &amp; Security</strong>, allow <strong>CuaDriver</strong> under Screen Recording and Accessibility, then check again. Opening these prompts does not grant access automatically.</p>
      : <p>Driver detection does not verify a usable graphical session. After setup, take a snapshot to check display access.</p>}
    {diagnostic.driver_path && <details><summary>Detected driver</summary><code>{diagnostic.driver_path}</code><small>{diagnostic.version || diagnostic.driver_source}</small></details>}
    {remote && <div className="computer-setup-access">
      <label><input type="checkbox" role="switch" checked={access.includes('view')} disabled={!enabled || !!busy}
        onChange={e => toggle(e.target.checked, access.includes('input'))} /><span>Allow observation from this dashboard<small>Screen access to this selected node.</small></span></label>
      <label><input type="checkbox" role="switch" checked={access.includes('input')} disabled={!enabled || !!busy || !access.includes('view')}
        onChange={e => toggle(true, e.target.checked)} /><span>Allow mouse and keyboard from this dashboard<small>Agent grants and the selected control mode still apply.</small></span></label>
    </div>}
    <p className="computer-setup-next"><CheckCircle2 size={14} />Then select an agent permission and take a snapshot. Input requires a fresh observed window.</p>
  </section>;
}
