import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Loader2,
  Lock,
  Monitor,
  Play,
  RefreshCw,
  Smartphone,
  Terminal,
  Tv,
  Unlock,
} from 'lucide-react';
import { api, post } from './api';
import './system_control.css';

interface Device {
  id: string;
  name: string;
  platform: 'macos' | 'android' | 'linux' | 'windows' | 'ios';
  state: string;
  resolution: [number, number];
  scale_factor: number;
  capabilities: string[];
  metadata: Record<string, any>;
  kill_switch?: boolean;
}

export function SystemControlView() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [killSwitch, setKillSwitch] = useState<boolean>(false);
  const [mode, setMode] = useState<'autonomous' | 'copilot' | 'view_only'>('autonomous');
  const [streamFrame, setStreamFrame] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{ norm: [number, number]; px: [number, number] } | null>(null);
  const [scriptText, setScriptText] = useState<string>('');
  const [scriptEngine, setScriptEngine] = useState<string>('osascript_applescript');
  const [scriptOutput, setScriptOutput] = useState<string | null>(null);
  const [scriptRunning, setScriptRunning] = useState<boolean>(false);
  const [uiTree, setUiTree] = useState<any>(null);
  const [fps, setFps] = useState<number>(0);
  const [error, setError] = useState<string>('');

  const wsRef = useRef<WebSocket | null>(null);
  const frameCountRef = useRef<number>(0);

  const selectedDevice = devices.find(d => d.id === selectedId) || devices[0];

  const loadDevices = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api<Device[]>('/cua/devices');
      setDevices(res);
      if (res.length > 0 && !selectedId) {
        setSelectedId(res[0].id);
        if (res[0].platform === 'macos') {
          setScriptEngine('osascript_applescript');
          setScriptText('tell application "Finder" to get name');
        } else if (res[0].platform === 'android') {
          setScriptEngine('adb_shell');
          setScriptText('dumpsys window | grep -E "mCurrentFocus"');
        } else {
          setScriptEngine('linux_shell');
          setScriptText('echo "Active user: $USER"');
        }
      }
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  // Connect WebSocket stream
  useEffect(() => {
    if (!selectedDevice) return;

    if (wsRef.current) {
      wsRef.current.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/v1/cua/devices/${selectedDevice.id}/stream`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    const fpsTimer = setInterval(() => {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
    }, 1000);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'frame' && msg.data) {
          setStreamFrame(`data:image/png;base64,${msg.data}`);
          frameCountRef.current += 1;
        } else if (msg.type === 'init') {
          setKillSwitch(!!msg.kill_switch);
        } else if (msg.type === 'kill_switch_status') {
          setKillSwitch(!!msg.active);
        }
      } catch (err) {
        // Ignored
      }
    };

    return () => {
      clearInterval(fpsTimer);
      ws.close();
    };
  }, [selectedDevice?.id]);

  async function toggleKillSwitch(nextState: boolean) {
    try {
      const res = await post<{ kill_switch: boolean }>('/cua/kill-switch', { active: nextState });
      setKillSwitch(res.kill_switch);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function takeManualSnapshot() {
    if (!selectedDevice) return;
    try {
      const res = await post<any>(`/cua/devices/${selectedDevice.id}/action`, { action: 'screenshot' });
      if (res.frame_base64) {
        setStreamFrame(`data:image/png;base64,${res.frame_base64}`);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleCanvasClick(e: React.MouseEvent<HTMLDivElement>) {
    if (mode === 'view_only' || killSwitch || !selectedDevice) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    try {
      await post(`/cua/devices/${selectedDevice.id}/action`, {
        action: selectedDevice.platform === 'android' ? 'touch' : 'left_click',
        coordinate: [nx, ny],
      });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function handleCanvasMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!selectedDevice) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const px = Math.round(nx * selectedDevice.resolution[0]);
    const py = Math.round(ny * selectedDevice.resolution[1]);
    setMousePos({ norm: [Math.round(nx * 1000) / 1000, Math.round(ny * 1000) / 1000], px: [px, py] });
  }

  async function runSemanticScript(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDevice || !scriptText.trim()) return;
    setScriptRunning(true);
    setScriptOutput(null);
    try {
      const res = await post<any>(`/cua/devices/${selectedDevice.id}/semantic`, {
        script: scriptText.trim(),
        engine: scriptEngine,
      });
      if (res.success) {
        setScriptOutput(res.output || 'Command executed successfully (no output).');
      } else {
        setScriptOutput(`Error: ${res.error || 'Execution failed.'}`);
      }
    } catch (err) {
      setScriptOutput(`Exception: ${(err as Error).message}`);
    } finally {
      setScriptRunning(false);
    }
  }

  async function inspectUiTree() {
    if (!selectedDevice) return;
    try {
      const res = await api<any>(`/cua/devices/${selectedDevice.id}/ui-tree`);
      setUiTree(res);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="system-control-shell">
      {/* Top Banner & Emergency Kill Switch */}
      <div className="sc-header">
        <div>
          <div className="eyebrow">STANDALONE CUA & SYSTEM CONTROL ENGINE</div>
          <h1>System Control & Real-Time Stream {loading && <Loader2 size={18} className="spin" style={{display:'inline', marginLeft: 8}} />}</h1>
          <p>Continuous hardware video streaming with dual-mode vision and native semantic execution.</p>
        </div>
        <div className="sc-actions">
          <button
            className={`sc-kill-switch-btn ${killSwitch ? 'is-active' : ''}`}
            onClick={() => toggleKillSwitch(!killSwitch)}
            title="Emergency halt for all agent inputs"
          >
            {killSwitch ? <Lock size={16} /> : <Unlock size={16} />}
            <span>{killSwitch ? 'KILL SWITCH ACTIVE (PAUSED)' : 'PAUSE ALL INPUT (KILL SWITCH)'}</span>
          </button>
        </div>
      </div>

      {error && <div className="notice warning" role="alert">{error}</div>}

      {/* Device Selector Strip */}
      <div className="sc-device-strip">
        {devices.map((dev) => {
          const isSel = dev.id === selectedId;
          const DevIcon = dev.platform === 'android' ? Smartphone : Monitor;
          return (
            <button
              key={dev.id}
              className={`sc-device-card ${isSel ? 'selected' : ''}`}
              onClick={() => {
                setSelectedId(dev.id);
                setUiTree(null);
                setScriptOutput(null);
                if (dev.platform === 'macos') {
                  setScriptEngine('osascript_applescript');
                  setScriptText('tell application "Finder" to get name');
                } else if (dev.platform === 'android') {
                  setScriptEngine('adb_shell');
                  setScriptText('dumpsys window | grep -E "mCurrentFocus"');
                } else {
                  setScriptEngine('linux_shell');
                  setScriptText('echo "Active window: $(xdotool getactivewindow getwindowname)"');
                }
              }}
            >
              <div className="sc-dev-top">
                <span className="sc-dev-avatar"><DevIcon size={20} /></span>
                <span className={`badge ${dev.state === 'online' ? 'good' : 'warning'}`}>
                  <i />{dev.state}
                </span>
              </div>
              <strong className="sc-dev-name">{dev.name}</strong>
              <small className="sc-dev-res">
                {dev.resolution[0]} × {dev.resolution[1]} · {dev.platform.toUpperCase()}
              </small>
            </button>
          );
        })}
      </div>

      {selectedDevice && (
        <div className="sc-grid">
          {/* Main Visual Stream Viewport */}
          <div className="panel sc-viewport-panel">
            <div className="sc-viewport-header">
              <div className="sc-stream-meta">
                <span className="live-indicator"><i />LIVE STREAM</span>
                <span>{selectedDevice.name}</span>
                <span className="fps-counter">{fps} FPS</span>
                {mousePos && (
                  <span className="coord-hud">
                    X: {mousePos.norm[0]} Y: {mousePos.norm[1]} ({mousePos.px[0]}px, {mousePos.px[1]}px)
                  </span>
                )}
              </div>
              <div className="sc-stream-tools">
                <button
                  className={mode === 'autonomous' ? 'active' : ''}
                  onClick={() => setMode('autonomous')}
                >
                  Autonomous
                </button>
                <button
                  className={mode === 'copilot' ? 'active' : ''}
                  onClick={() => setMode('copilot')}
                >
                  Co-Pilot (Interactive)
                </button>
                <button
                  className={mode === 'view_only' ? 'active' : ''}
                  onClick={() => setMode('view_only')}
                >
                  View Only
                </button>
                <button onClick={takeManualSnapshot} title="Capture fresh snapshot">
                  <Camera size={14} /> Snapshot
                </button>
              </div>
            </div>

            {/* Video Canvas Container */}
            <div
              className={`sc-canvas-container ${mode === 'copilot' ? 'copilot-cursor' : ''}`}
              onClick={handleCanvasClick}
              onMouseMove={handleCanvasMouseMove}
            >
              {streamFrame ? (
                <img
                  src={streamFrame}
                  alt="Live System Stream"
                  className="sc-stream-image"
                />
              ) : (
                <div className="sc-placeholder">
                  <Tv size={42} strokeWidth={1.2} />
                  <h3>Waiting for visual stream…</h3>
                  <p>Hardware capture initialized for {selectedDevice.name}</p>
                  <button className="primary" onClick={takeManualSnapshot}>
                    Trigger frame snapshot
                  </button>
                </div>
              )}

              {killSwitch && (
                <div className="sc-kill-overlay">
                  <Lock size={48} />
                  <h2>OPERATOR KILL SWITCH ENGAGED</h2>
                  <p>All mouse, keyboard, and script actions are paused for safety.</p>
                  <button className="primary" onClick={() => toggleKillSwitch(false)}>
                    Resume Control
                  </button>
                </div>
              )}
            </div>

            <div className="sc-viewport-footer">
              <small>
                {mode === 'copilot'
                  ? 'Co-pilot mode: Clicking directly on the canvas injects mouse/touch events into the device.'
                  : 'Autonomous mode: Agent OS and Hermes drive inputs. Tap spacebar or the kill-switch to intervene.'}
              </small>
            </div>
          </div>

          {/* Right Sidebar: Semantic Execution & UI Inspector */}
          <div className="sc-sidebar-column">
            {/* Semantic Native Scripting */}
            <div className="panel padded">
              <div className="section-title">
                <div>
                  <h2>Native Semantic Execution</h2>
                  <p>Deterministic OS-level automation without pixel guessing.</p>
                </div>
                <Terminal size={18} />
              </div>

              <form onSubmit={runSemanticScript}>
                <div className="form-columns">
                  <label>
                    Engine
                    <select
                      value={scriptEngine}
                      onChange={(e) => setScriptEngine(e.target.value)}
                    >
                      {selectedDevice.platform === 'macos' && (
                        <>
                          <option value="osascript_applescript">AppleScript (osascript)</option>
                          <option value="osascript_jxa">JavaScript for Automation (JXA)</option>
                        </>
                      )}
                      {selectedDevice.platform === 'android' && (
                        <option value="adb_shell">ADB Shell Command</option>
                      )}
                      {selectedDevice.platform === 'linux' && (
                        <option value="linux_shell">Linux Shell / xdotool</option>
                      )}
                    </select>
                  </label>
                </div>

                <label style={{ marginTop: 8 }}>
                  Script or Command
                  <textarea
                    rows={4}
                    className="code"
                    value={scriptText}
                    onChange={(e) => setScriptText(e.target.value)}
                    placeholder="Enter script to run..."
                  />
                </label>

                <div className="button-row" style={{ marginTop: 12 }}>
                  <button
                    className="primary"
                    type="submit"
                    disabled={scriptRunning || !scriptText.trim() || killSwitch}
                  >
                    {scriptRunning ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
                    Execute on {selectedDevice.name}
                  </button>
                </div>
              </form>

              {scriptOutput && (
                <div className="sc-script-output">
                  <small>Execution Output</small>
                  <pre>{scriptOutput}</pre>
                </div>
              )}
            </div>

            {/* UI Tree & Active Window Inspector */}
            <div className="panel padded" style={{ marginTop: 20 }}>
              <div className="section-title">
                <div>
                  <h2>Accessibility & UI Tree</h2>
                  <p>Inspect active window and element hierarchy without image tokens.</p>
                </div>
                <button onClick={inspectUiTree}><RefreshCw size={14} /> Inspect</button>
              </div>

              {uiTree ? (
                <div className="sc-tree-viewer">
                  <div className="sc-tree-item">
                    <strong>Active Window:</strong> {uiTree.active_window || uiTree.frontmost_process || 'N/A'}
                  </div>
                  <pre>{JSON.stringify(uiTree, null, 2)}</pre>
                </div>
              ) : (
                <p className="hint">Click Inspect to query the active window hierarchy from the device.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
