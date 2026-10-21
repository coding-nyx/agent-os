import { useEffect, useState } from 'react';
import { ArrowDownToLine, CheckCircle2, Copy, Loader2, Package, RefreshCw } from 'lucide-react';
import { api, copyText, Item, post } from './api';
import './node_updates.css';

type Release = { version: string; build_id: string; filename: string; size: number; sha256: string; download_path: string; notes_path: string };
type Update = { installed: Release | null; available: Release; bootstrap_required: boolean; update_available: boolean;
  ahead: boolean; status: string; can_cancel?: boolean; last_seen?: string; request?: { id: string; version: string; phase: string; detail?: string } | null };
const phases: Record<string, string> = { queued: 'Update queued', downloading: 'Downloading package', verifying: 'Verifying package',
  installing_dependencies: 'Preparing application environment', installing_runtime: 'Preparing Hermes runtime', checking: 'Checking the staged release',
  waiting_for_idle: 'Waiting for managed work to finish', restarting: 'Restarting node worker', complete: 'Update confirmed', failed: 'Update failed', cancelled: 'Update cancelled' };

export function NodeSoftwareUpdate({ machine }: { machine: Item }) {
  const [data, setData] = useState<Update | null>(machine.update_status || null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [command, setCommand] = useState('');
  const [copied, setCopied] = useState(false);
  const [seen, setSeen] = useState(machine.last_seen);
  async function load() {
    try { setData(await api(`/machines/${machine.id}/update`)); setError(''); }
    catch (e) { setError((e as Error).message); }
  }
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const next = await api<Update>(`/machines/${machine.id}/update`);
        if (alive) { setData(next); setSeen(next.last_seen); setError(''); }
      } catch (e) { if (alive) setError((e as Error).message); }
    };
    refresh(); const timer = setInterval(refresh, 5000);
    return () => { alive = false; clearInterval(timer); };
  }, [machine.id]);
  const request = data?.request;
  const pending = !!request && !['complete', 'failed', 'cancelled'].includes(request.phase);
  const online = !!seen && Date.now() - Date.parse(seen) < 20000;
  async function update() {
    if (!data) return;
    setBusy(true); setError('');
    try { setData(await post(`/machines/${machine.id}/update`, { build_id: data.available.build_id })); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function bootstrap() {
    setBusy(true); setError(''); setCopied(false);
    try {
      const result = await api(`/machines/${machine.id}/update/bootstrap`);
      setCommand(result.command);
      try { await copyText(result.command); setCopied(true); } catch { /* The command remains selectable. */ }
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="node-software" aria-label={`Software updates for ${machine.name}`}>
    <header><span className="node-software-title"><Package size={17} />Node software</span>
      <button type="button" className="icon-button" aria-label={`Refresh ${machine.name} version`} onClick={load}><RefreshCw size={14} /></button></header>
    <div className="node-software-versions">
      <div><small>Installed on {machine.name}</small><strong>{data?.installed ? `v${data.installed.version}` : 'Version not reported'}</strong>
        <span>{data?.installed ? `Build ${data.installed.build_id.slice(0, 12)}` : 'Legacy worker · update support needed'}</span></div>
      <div><small>Available from this host</small><strong>{data ? `v${data.available.version}` : 'Checking…'}</strong>
        <span>{data && `Build ${data.available.build_id.slice(0, 12)}`}</span></div>
    </div>
    {error && <div className="notice warning" role="alert">{error}</div>}
    {request && <div className={'node-update-progress ' + (request.phase === 'failed' ? 'has-error' : '')} role="status">
      {pending ? <Loader2 size={15} className="spin" /> : request.phase === 'complete' ? <CheckCircle2 size={15} /> : <Package size={15} />}
      <div><strong>{phases[request.phase] || request.phase}</strong><small>{request.detail ||
        (!online && pending ? 'The request is saved. It begins when the node worker reconnects.' : `Target v${request.version}`)}</small></div>
    </div>}
    {data?.can_cancel && request && <button type="button" disabled={busy} onClick={async () => {
      setBusy(true); setError('');
      try { setData(await post(`/machines/${machine.id}/update/cancel`, {request_id:request.id})); }
      catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }}>Cancel queued update</button>}
    {data?.bootstrap_required ? <>
      <p>This worker needs a one-time upgrade before dashboard updates are available. Stop its old worker, then run the upgrade command on {machine.name}.</p>
      <button type="button" disabled={busy} onClick={bootstrap}><Copy size={14} />{copied ? 'Upgrade command copied' : 'Copy upgrade command'}</button>
      {command && <pre className="node-update-command" tabIndex={0}>{command}</pre>}
    </> : <>
      <div className="node-software-actions"><button type="button" className="primary" disabled={busy || pending || !data?.update_available} onClick={update}>
        {busy || pending ? <Loader2 size={14} className="spin" /> : <ArrowDownToLine size={14} />}
        {pending ? 'Update in progress' : data?.status === 'up_to_date' ? 'Up to date' : data?.ahead ? 'Node is newer than host' : online ? 'Update node' : 'Queue node update'}</button>
        {data && <a className="button" href={data.available.download_path}>Download package</a>}</div>
      <p>The node stages and verifies the release, finishes managed work, then restarts. A failed worker boot restores the previous release.</p>
    </>}
    {data && <details className="node-release-details"><summary>Release details</summary><p>{data.available.filename} · {Math.ceil(data.available.size / 1024)} KB</p>
      <small>SHA-256</small><code>{data.available.sha256}</code><a href={data.available.notes_path} target="_blank" rel="noreferrer">Read release notes</a>
      {data.bootstrap_required && <a href={data.available.download_path}>Download package</a>}</details>}
  </section>;
}
