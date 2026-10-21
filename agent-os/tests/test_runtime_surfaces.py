"""Production-bundle browser checks with intercepted APIs and synthetic images."""
import json
import mimetypes
import os
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pytest
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
NODE = "25017022-8b9c-4f5c-8a0b-328ee20b8ca2"
PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII="


@pytest.fixture
def ui():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=os.environ.get("ARA_BROWSER_EXECUTABLE", "/usr/bin/google-chrome"), args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 1440, "height": 1100})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        yield page
        browser.close()
        assert not errors, errors


def serve_bundle(page, handler, *, profiles=None, origin="http://127.0.0.1:8787"):
    def route(request):
        path = urlsplit(request.request.url).path
        if path.startswith("/api/v1"):
            path = path.removeprefix("/api/v1")
            payload = handler(path, request.request)
            if payload is None:
                payload = {
                    "/dashboard": {"role": "host", "profiles": profiles or [], "datasets": [], "runs": [], "waiting": [], "machines": []},
                    "/catalog": {"presets": [], "modules": []}, "/profiles": profiles or [],
                }.get(path, [])
            request.fulfill(json=payload)
        else:
            asset = ROOT / "web/dist" / (path.lstrip("/") if path.startswith("/assets/") else "index.html")
            request.fulfill(path=str(asset), content_type=mimetypes.guess_type(asset)[0] or "application/octet-stream")
    page.route("**/*", route)
    page.goto(origin)


def test_desktop_controls_bind_input_and_explain_node_setup(ui, tmp_path):
    inputs, captures = [], []
    def handler(path, request):
        if path == "/cua/session":
            return {"token": "fixture-token"}
        if path == "/cua/devices":
            return [{"id": "local_desktop", "name": "Fixture desktop", "state": "needs_verification"},
                {"id": "node:" + NODE, "name": "Edge node", "state": "disabled"}]
        if path == "/cua/state":
            return {"mode": "supervised", "kill_switch": False, "grants": {}, "epoch": 1, "remote_access": []}
        if path.endswith("/action"):
            body = request.post_data_json
            if body["action"] == "screenshot":
                captures.append("observation-" + str(len(captures)))
                return {"success": True, "frame_base64": PNG, "metadata": {"format": "png", "observation_id": captures[-1]}}
            inputs.append(body)
            return {"success": True, "metadata": {"effect": "confirmed"}}
    serve_bundle(ui, handler)
    ui.locator("nav").get_by_role("button", name="System Control", exact=True).click()
    expect(ui.get_by_role("button", name="Send text", exact=True)).to_be_disabled()
    ui.get_by_role("button", name="Snapshot", exact=True).click()
    ui.get_by_label("Type into the observed window").fill("Type only once")
    expect(ui.get_by_role("button", name="Send text", exact=True)).to_be_enabled()
    ui.get_by_role("button", name="Send text", exact=True).click()
    expect(ui.get_by_label("Type into the observed window")).to_have_value("")
    assert inputs[0]["text"] == "Type only once"
    assert inputs[0]["observation_id"] == "observation-0"
    assert inputs[0]["operation_id"]
    expect(ui.get_by_role("button", name="Enter", exact=True)).to_be_enabled()
    ui.get_by_role("button", name="Enter", exact=True).click()
    expect(ui.get_by_role("button", name="Scroll down", exact=True)).to_be_enabled()
    ui.get_by_role("button", name="Scroll down", exact=True).click()
    expect(ui.get_by_role("button", name="Enter", exact=True)).to_be_enabled()
    assert [body["action"] for body in inputs] == ["type", "key", "scroll"]
    assert inputs[1]["observation_id"] == "observation-1"
    assert inputs[2]["observation_id"] == "observation-2"
    assert len({body["operation_id"] for body in inputs}) == 3
    ui.screenshot(path=str(tmp_path / "computer-controls.png"), full_page=True)
    ui.get_by_label("Desktop", exact=True).select_option("node:" + NODE)
    expect(ui.get_by_text("On the selected node", exact=True)).to_be_visible()
    expect(ui.get_by_role("button", name="Save permission", exact=True)).to_have_count(0)
    expect(ui.get_by_role("button", name="Send text", exact=True)).to_be_disabled()
    ui.set_viewport_size({"width": 390, "height": 844})
    ui.wait_for_function("document.querySelector('.sidebar').getBoundingClientRect().right <= 1")
    assert ui.evaluate("document.documentElement.scrollWidth <= innerWidth")


def test_deployment_controls_check_and_start_the_selected_node(ui):
    calls = []
    profile = {"id": "test-agent", "revision": 1, "name": "Test agent", "preset": "custom", "native_name": "test-agent",
        "enabled": True, "provision_state": "definition_ready", "bindings": [], "delegation_targets": [],
        "deployments": [{"machine_id": NODE, "native_name": "test-agent", "enabled": True}],
        "execution_placement": {"machine_id": NODE}, "_runtime_target": {"machine_id": NODE, "machine_name": "Edge node"}}
    def handler(path, request):
        if path == "/profiles/test-agent":
            return profile
        if path == "/profiles/test-agent/deployments":
            return {"profile_id": profile["id"], "revision": 1, "profile_enabled": True, "primary_machine_id": NODE,
                "machines": [{"machine_id": NODE, "machine_name": "Edge node", "native_name": "test-agent", "online": True,
                    "available": True, "desired_enabled": True, "enabled": True, "state": "active", "runtime_state": "stopped", "model_configured": True}]}
        if path == "/profiles/test-agent/runtime" or path.endswith("/runtime/start"):
            calls.append((path, parse_qs(urlsplit(request.url).query)))
            return {"state": "running" if path.endswith("/start") else "error", "reason": "runtime_exited" if not path.endswith("/start") else None,
                "detail": "Native profile could not start" if not path.endswith("/start") else None}
        if path == "/profiles/test-agent/definition":
            return {"revision": None}
        if path == "/machines":
            return [{"id": NODE, "name": "Edge node", "instances": []}]
    serve_bundle(ui, handler, profiles=[profile])
    ui.locator("nav").get_by_role("button", name="Agents", exact=False).click()
    ui.get_by_role("button", name="Open agent Test agent", exact=True).click()
    ui.get_by_role("tab", name="Deployments", exact=True).click()
    expect(ui.get_by_text("Runtime stopped", exact=True)).to_be_visible()
    ui.get_by_role("button", name="Check runtime", exact=True).click()
    expect(ui.get_by_text("Native profile could not start", exact=True)).to_be_visible()
    ui.get_by_role("button", name="Start runtime", exact=True).click()
    expect(ui.get_by_text("Runtime running", exact=True)).to_be_visible()
    assert len(calls) == 2
    assert all(query == {"machine_id": [NODE]} for _, query in calls)


@pytest.mark.parametrize("legacy,online", [(False, True), (False, False), (True, True)])
def test_node_update_controls_distinguish_legacy_offline_and_queued(ui, tmp_path, legacy, online):
    from datetime import datetime, timezone
    calls = []
    release = {"version": "0.2.0", "build_id": "b" * 64, "sha256": "c" * 64, "size": 250000,
        "filename": "ara-node-0.2.0-bbbbbbbbbbbb.tar.gz", "download_path": "/api/v1/releases/" + "b" * 64 + "/package",
        "notes_path": "/api/v1/releases/current/notes"}
    data = {"installed": None if legacy else {"version": "0.1.0", "build_id": "a" * 64}, "available": release,
        "bootstrap_required": legacy, "update_available": not legacy, "ahead": False, "request": None,
        "status": "bootstrap_required" if legacy else "update_available", "last_seen": datetime.now(timezone.utc).isoformat() if online else None}
    machine = {"id": NODE, "revision": 1, "name": "Work", "role": "node", "state": "paired", "update_status": data}
    def handler(path, request):
        if path == "/machines": return [machine]
        if path == "/network/status": return {"endpoints": {}, "tailscale": {}, "exposed": False}
        if path == f"/machines/{NODE}/update/bootstrap": return {"command": "curl -fsSL http://fixture/node-upgrade.sh | bash"}
        if path == f"/machines/{NODE}/update":
            if request.method == "POST":
                calls.append(request.post_data_json)
                data["request"] = {"id": "queued-update", "version": "0.2.0", "phase": "queued"}
            return data
    serve_bundle(ui, handler)
    ui.locator("nav").get_by_role("button", name="Machines & sync", exact=False).click()
    panel = ui.get_by_role("region", name="Software updates for Work")
    expect(panel.get_by_text("v0.2.0", exact=True)).to_be_visible()
    if legacy:
        expect(panel.get_by_text("Version not reported", exact=True)).to_be_visible()
        expect(panel.get_by_role("button", name="Update node", exact=True)).to_have_count(0)
        panel.get_by_role("button", name="Copy upgrade command", exact=True).click()
        expect(panel.locator("pre")).to_contain_text("node-upgrade.sh")
        assert not calls
    else:
        expect(panel.get_by_text("v0.1.0", exact=True)).to_be_visible()
        panel.get_by_role("button", name="Update node" if online else "Queue node update", exact=True).click()
        expect(panel.get_by_text("Update queued", exact=True)).to_be_visible()
        expect(panel.get_by_role("button", name="Update in progress", exact=True)).to_be_disabled()
        assert calls == [{"build_id": release["build_id"]}]
        if not online: expect(panel.get_by_text("The request is saved. It begins when the node worker reconnects.", exact=True)).to_be_visible()
    ui.screenshot(path=str(tmp_path / "node-update-desktop.png"), full_page=True)
    ui.set_viewport_size({"width": 390, "height": 844})
    ui.wait_for_function("document.querySelector('.sidebar').getBoundingClientRect().right <= 1")
    assert ui.evaluate("document.documentElement.scrollWidth <= innerWidth")


def test_private_http_chat_sends_distinct_operations_without_random_uuid(ui):
    import re
    calls, conversations = [], []
    profile = {"id": "http-agent", "revision": 1, "name": "HTTP agent", "preset": "custom", "native_name": "http-agent",
        "enabled": True, "provision_state": "ready", "bindings": [], "delegation_targets": [],
        "model_connection": {"model": "fixture"}, "model_ready": True,
        "deployments": [{"machine_id": NODE, "native_name": "http-agent", "enabled": True}],
        "execution_placement": {"machine_id": NODE}, "_runtime_target": {"machine_id": NODE, "machine_name": "Work"}}
    conversation = {"id": "http-conversation", "title": "HTTP browser test", "profile_id": profile["id"],
        "runtime_owner": {"machine_id": NODE, "machine_name": "Work"}, "runs": []}
    def handler(path, request):
        if path == "/profiles/http-agent": return profile
        if path == "/profiles/http-agent/deployments":
            return {"primary_machine_id": NODE, "machines": [{"machine_id": NODE, "machine_name": "Work", "desired_enabled": True,
                "enabled": True, "online": True, "state": "active", "runtime_state": "running"}]}
        if path == "/conversations":
            if request.method == "POST":
                calls.append((path, request.post_data_json)); conversations.append(conversation)
                return conversation
            return conversations
        if path == "/conversations/http-conversation": return conversation
        if path == "/conversations/http-conversation/messages":
            body = request.post_data_json
            calls.append((path, body))
            run = {"id": str(len(conversation["runs"])), "state": "succeeded", "input": body["text"], "output": "HTTP reply " + body["text"]}
            conversation["runs"].append(run)
            return run
    serve_bundle(ui, handler, profiles=[profile], origin="http://192.0.2.10:8787")
    assert ui.evaluate("!isSecureContext && typeof crypto.randomUUID === 'undefined'")
    ui.locator("nav").get_by_role("button", name="Agents", exact=False).click()
    ui.get_by_role("button", name="Open agent HTTP agent", exact=True).click()
    ui.get_by_role("tab", name="Conversation", exact=True).click()
    for text in ["First", "Second"]:
        ui.get_by_label("Message agent", exact=True).fill(text)
        ui.get_by_role("button", name="Send message", exact=True).click()
        expect(ui.get_by_text("HTTP reply " + text, exact=True)).to_be_visible()
    messages = [body for path, body in calls if path.endswith("/messages")]
    assert len(messages) == 2 and len({body["operation_id"] for body in messages}) == 2
    assert all(re.fullmatch(r"[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}", body["operation_id"]) for body in messages)
    assert calls[0][1]["machine_id"] == NODE
    expect(ui.get_by_text("crypto.randomUUID is not a function", exact=False)).to_have_count(0)


def test_chat_renders_markdown_safely_and_copies_code_over_private_http(ui):
    profile = {"id": "markdown-agent", "revision": 1, "name": "Markdown agent", "preset": "custom", "native_name": "markdown-agent",
        "enabled": True, "provision_state": "ready", "bindings": [], "delegation_targets": [],
        "model_connection": {"model": "fixture"}, "model_ready": True,
        "deployments": [{"machine_id": "local", "native_name": "markdown-agent", "enabled": True}],
        "_runtime_target": {"machine_id": "local", "machine_name": "This machine"}}
    output = ('## A readable answer\n\n**Important** and `inline()`\n\n'
        '| Machine | Status |\n| --- | --- |\n| Work | Online |\n\n'
        '```python\nprint("hello")\n```\n\n'
        '[Safe link](https://example.com) [Unsafe](javascript:alert(1))\n\n'
        '<script>window.markdownExecuted=true</script>\n\n'
        '![Private image](https://example.com/tracker.png)')
    conversation = {"id": "markdown-conversation", "title": "Markdown test", "runtime_owner": {"machine_id": "local"},
        "runs": [{"id": "markdown-run", "state": "succeeded", "input": "Show rich text", "output": output}]}
    def handler(path, request):
        if path == "/profiles/markdown-agent": return profile
        if path == "/profiles/markdown-agent/deployments":
            return {"primary_machine_id": "local", "machines": [{"machine_id": "local", "machine_name": "This machine",
                "desired_enabled": True, "enabled": True, "online": True, "state": "active", "runtime_state": "running"}]}
        if path == "/conversations": return [conversation]
        if path == "/conversations/markdown-conversation": return conversation
    ui.add_init_script('''window.copiedText=[]; document.execCommand=command=>{
        if(command==='copy'){window.copiedText.push(document.activeElement.value);return true;}return false;
    }''')
    serve_bundle(ui, handler, profiles=[profile], origin="http://192.0.2.10:8787")
    assert ui.evaluate("!isSecureContext && !navigator.clipboard")
    ui.locator("nav").get_by_role("button", name="Agents", exact=False).click()
    ui.get_by_role("button", name="Open agent Markdown agent", exact=True).click()
    ui.get_by_role("tab", name="Conversation", exact=True).click()
    expect(ui.get_by_role("heading", name="A readable answer")).to_be_visible()
    expect(ui.locator('.rich-text strong')).to_have_text("Important")
    expect(ui.get_by_role("cell", name="Online", exact=True)).to_be_visible()
    expect(ui.locator('.rich-text pre code')).to_have_text('print("hello")\n')
    assert ui.locator('.rich-text script, .rich-text img, .rich-text a[href^="javascript:"]').count() == 0
    assert ui.evaluate("!window.markdownExecuted")
    safe = ui.get_by_role("link", name="Safe link", exact=True)
    expect(safe).to_have_attribute("rel", "noopener noreferrer")
    ui.get_by_role("button", name="Copy code", exact=True).click()
    expect(ui.locator('.code-block [role=status]')).to_have_text("Copied")
    assert ui.evaluate('window.copiedText') == ['print("hello")\n']
    ui.set_viewport_size({"width":390,"height":844})
    assert ui.evaluate('document.documentElement.scrollWidth<=innerWidth')


def test_network_copy_uses_http_fallback_and_reports_failure(ui):
    def handler(path, request):
        if path == "/network/status": return {"endpoints": {"tailscale":"http://100.64.0.2:8787"},
            "tailscale": {"ip":"100.64.0.2"}, "exposed":True}
    ui.add_init_script("window.copyWorks=true; window.copiedText=[]; document.execCommand=()=>{window.copiedText.push(document.activeElement.value);return window.copyWorks;}")
    serve_bundle(ui, handler, origin="http://192.0.2.10:8787")
    ui.locator("nav").get_by_role("button", name="Machines & sync").click()
    button = ui.get_by_role("button", name="Copy Tailscale URL", exact=False)
    button.click()
    expect(ui.get_by_role("status")).to_contain_text('Copied URL: http://100.64.0.2:8787')
    assert ui.evaluate('window.copiedText') == ['http://100.64.0.2:8787']
    expect(button).to_be_focused()
    ui.evaluate('window.copyWorks=false')
    button.click()
    expect(ui.get_by_role("status")).to_contain_text('Clipboard unavailable. Select the text and copy it manually.')


@pytest.mark.parametrize("width", [1440, 768, 390])
def test_long_dropdown_labels_fit_forms_and_keep_one_arrow(ui, width, tmp_path):
    serve_bundle(ui, lambda path, request: None)
    ui.set_viewport_size({"width": width, "height": 900})
    # Exercise the shared styles in every select container used by the app,
    # including adjacent fields, setup, planning, bindings and runtime pickers.
    ui.locator("main").evaluate('''element => {
        const option = '<option>' + 'A long provider or execution machine name '.repeat(10) + '</option>';
        const select = name => '<select aria-label="' + name + '">' + option + '</select>';
        element.innerHTML = '<section class="panel padded"><div class="form-columns"><label>Provider' + select('Provider') +
          '</label><label>Protocol' + select('Protocol') + '</label></div><div class="agent-setup-form"><label>Setup' + select('Setup') +
          '</label></div><div class="planning-column"><label>Status' + select('Status') + '</label></div>' +
          '<div class="binding-row"><div>A dataset name</div>' + select('Access') + '</div>' +
          '<div class="instance-selector"><label>Runtime' + select('Runtime') + '</label></div></section>';
    }''')
    metrics = ui.locator("main select").evaluate_all('''elements => elements.map(element => {
        const rect = element.getBoundingClientRect(), parent = element.parentElement.getBoundingClientRect(), style = getComputedStyle(element);
        return {label:element.getAttribute('aria-label'),left:rect.left,right:rect.right,parentRight:parent.right,
            appearance:style.appearance,image:style.backgroundImage,padding:parseFloat(style.paddingInlineEnd)};
    })''')
    assert len(metrics) == 6
    for m in metrics:
        assert 0 <= m["left"] < m["right"] <= width and m["right"] <= m["parentRight"] + 1, m
        assert m["appearance"] == "none" and m["image"].startswith('url("data:image/svg+xml,'), m
        assert m["padding"] >= 32, m
    assert ui.evaluate("document.documentElement.scrollWidth <= innerWidth")
    ui.screenshot(path=str(tmp_path / f"dropdowns-{width}.png"), full_page=True)


def test_mac_setup_requests_os_permissions_and_keeps_remote_access_separate(ui, tmp_path):
    calls = []
    diagnostic = {"platform": "darwin", "installed": True, "driver_path": "/Applications/CuaDriver.app/Contents/MacOS/cua-driver",
        "accessibility": False, "screen_recording": False}
    policy = {"mode": "view_only", "kill_switch": False, "grants": {}, "epoch": 1, "remote_access": [], "setup_supported": True}
    profile = {"id": "scout", "name": "Scout", "enabled": True, "deployments": [{"machine_id": NODE, "enabled": True}]}
    def handler(path, request):
        if path == "/cua/devices": return [{"id": "node:" + NODE, "name": "Work · node desktop", "platform": "macos",
            "state": "disabled", "metadata": {"installed": True}}]
        if path == "/cua/session": return {"token": "test-only"}
        if path == "/profiles": return [profile]
        if path == "/cua/setup":
            if request.method == "POST":
                body = request.post_data_json
                calls.append((body, parse_qs(urlsplit(request.url).query)))
                return {"success": True, "request_started": body["action"] == "request_permissions", "diagnostics": dict(diagnostic),
                    "detail": "Approve CuaDriver on the Mac, then check again."}
            return {"supported": True, "platform": "darwin", "online": True, "diagnostics": dict(diagnostic)}
        if path == "/cua/state":
            if request.method == "PUT":
                body = request.post_data_json
                calls.append((body, parse_qs(urlsplit(request.url).query)))
                policy.update(body)
            return policy
    serve_bundle(ui, handler)
    ui.locator("nav").get_by_role("button", name="System Control", exact=True).click()
    ui.get_by_label("Desktop", exact=True).select_option("node:" + NODE)
    panel = ui.get_by_role("region", name="Desktop setup and permissions", exact=True)
    expect(panel.get_by_text("Detected", exact=True)).to_be_visible()
    expect(panel.get_by_text("Permission needed", exact=True)).to_have_count(2)
    assert not calls  # Rendering the setup instructions never opens an OS prompt.
    panel.get_by_role("button", name="Request macOS permissions", exact=True).click()
    expect(panel.get_by_role("status")).to_contain_text("Approve CuaDriver")
    expect(panel.get_by_text("Permission needed", exact=True)).to_have_count(2)
    view = panel.get_by_role("switch", name="Allow observation from this dashboard", exact=False)
    expect(view).not_to_be_checked()
    assert calls[0][0]["action"] == "request_permissions" and calls[0][1] == {"machine_id": [NODE]}
    diagnostic.update(accessibility=True, screen_recording=True)
    panel.get_by_role("button", name="Check driver & permissions", exact=True).click()
    expect(panel.get_by_text("Granted", exact=True)).to_have_count(2)
    expect(view).not_to_be_checked()
    view.click()
    expect(view).to_be_checked()
    assert calls[-1][0] == {"remote_access": ["view"]}
    ui.get_by_label("Agent", exact=True).select_option("scout")
    ui.get_by_label("Authority", exact=True).select_option("view")
    ui.get_by_role("button", name="Save permission", exact=True).click()
    expect(ui.get_by_text("Scout: view", exact=True)).to_be_visible()
    assert calls[-1][0] == {"grants": {"scout": ["view"]}}
    ui.set_viewport_size({"width": 390, "height": 844})
    ui.wait_for_function("document.querySelector('.sidebar').getBoundingClientRect().right <= 1")
    assert ui.evaluate("document.documentElement.scrollWidth <= innerWidth")
    ui.screenshot(path=str(tmp_path / "mac-desktop-setup.png"), full_page=True)
