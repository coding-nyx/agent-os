# ARA CUA: Cross-Platform System Control & Real-Time Video Streaming

## 1. Overview

**ARA CUA** is an encapsulated Computer-Using Agent engine built into ARA Agent OS and executable standalone on local nodes. It provides universal system observation, normalized input injection, and native semantic scripting across:

1. **macOS** *(ScreenCaptureKit, CoreGraphics, native `osascript` AppleScript & JXA)*
2. **Android** *(scrcpy-server H.264 stream, binary touch socket, `adb shell`)*
3. **Linux** *(PipeWire/XShm capture, `/dev/uinput` / `xdotool`, desktop shell)*
4. **Windows & iOS** *(DXGI Desktop Duplication & WebDriverAgent)*

---

## 2. Two Operating Modes

### Mode A: Standalone Hermes Node (Agent OS Inactive)
Hermes can run directly on any machine without requiring the Agent OS web server or PostgreSQL database.
Hermes accesses computer control via the **stdio JSON-RPC MCP server**:

```bash
# Test or run standalone CUA MCP server
ara cua mcp
```

Configure in Hermes profile `config.yaml`:
```yaml
mcp_servers:
  cua:
    command: "ara"
    args: ["cua", "mcp"]
```

### Mode B: Connected Agent OS Fleet (Agent OS Active)
When Agent OS is running:
- Visual feeds stream over WebSockets at low latency directly into the **System Control** tab in the web dashboard.
- Features real-time HUD (normalized coordinates, FPS counter), operator mouse takeover (co-pilot mode), and an emergency operator **Kill Switch**.
- Tools are accessible to all profile agents and multi-agent swarms over the authenticated MCP endpoint (`POST /mcp/{profile_id}`).

---

## 3. Dual-Engine Execution: Semantic Scripting + Pixel Vision

Instead of forcing all tasks through imprecise pixel coordinate guesses, ARA CUA uses a hybrid architecture:

| Task Type | Execution Layer | Mechanism | Latency / Accuracy |
|---|---|---|---|
| **App lifecycle & windowing** | Semantic | `osascript` (macOS), `am start` (Android) | 5ms / 100% deterministic |
| **Menu navigation & clipboard** | Semantic | System Events (macOS), `input text` (Android) | 5ms / 100% deterministic |
| **UI structure query** | Semantic | `AXUIElement` / `dumpsys window` | 10ms / Zero vision tokens |
| **Canvas / unscripted apps** | Vision + Pixel | Continuous stream + normalized coordinates | 30–60 FPS / Vision grounded |

---

## 4. MCP Tool Specifications

### `ara_cua_list_devices`
Lists all online connected devices with platform, resolution, scale factor, and capabilities.

### `ara_cua_computer`
Executes normalized input actions and instant visual inspection:
- `device_id`: Device identifier (e.g. `macos_local`, `android_...`, `linux_local`).
- `action`: `screenshot`, `mouse_move`, `left_click`, `right_click`, `double_click`, `triple_click`, `mouse_down`, `mouse_up`, `drag`, `scroll`, `touch`, `swipe`, `type`, `key`, `hotkey`.
- `coordinate`: Normalized `[x, y]` from `0.0` to `1.0`.
- `end_coordinate`: Normalized `[x, y]` for drag/swipe.
- `text`: Text to type.
- `keys`: Key combinations (e.g. `["command", "space"]`, `["enter"]`).

### `ara_cua_semantic`
Executes deterministic OS scripts:
- `device_id`: Device identifier.
- `script`: The script content.
- `engine`: `osascript_applescript`, `osascript_jxa`, `adb_shell`, `linux_shell`, `powershell`.

### `ara_cua_ui_tree`
Returns structured active window and element hierarchy without image token costs.

---

## 5. REST & WebSocket Endpoints

- `GET /api/v1/cua/devices`: List discovered devices.
- `POST /api/v1/cua/devices/{id}/action`: Dispatches a normalized CUA input action.
- `POST /api/v1/cua/devices/{id}/semantic`: Dispatches native OS-level script.
- `GET /api/v1/cua/devices/{id}/frame`: Downloads instant snapshot (JPEG/PNG).
- `GET /api/v1/cua/devices/{id}/ui-tree`: Returns structured accessibility tree.
- `POST /api/v1/cua/kill-switch`: Toggles emergency operator kill switch.
- `WebSocket /api/v1/cua/devices/{id}/stream`: Real-time streaming feed and interactive command socket.

---

## 6. Dashboard Interface

Located in the dashboard left navigation under **System Control** (`http://127.0.0.1:8787`):
1. **Device Strip**: Switch between Mac, Android, and Linux devices.
2. **Emergency Kill Switch**: Prominent red/amber toggle to immediately halt all agent input actions.
3. **Live Stream Viewport**: Real-time canvas with FPS counter and live mouse coordinate HUD.
4. **Operating Mode Switcher**: Toggle between `Autonomous`, `Co-Pilot (Interactive)`, and `View Only`.
5. **Semantic Execution Console**: Run AppleScript / JXA or shell commands with live output.
6. **Accessibility Tree Inspector**: View frontmost process and window title hierarchy.
