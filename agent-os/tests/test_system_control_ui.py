"""Browser checks do not capture or control the physical desktop."""
import json
import os
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


def test_system_control_policy_and_responsive_surfaces(system):
    c = system["client"]
    token = c.get("/cua/session").json()["token"]
    headers = {"Authorization": "Bearer " + token}
    original = c.get("/cua/state", headers=headers).json()
    output = Path(__file__).resolve().parents[1] / "test-results"
    output.mkdir(exist_ok=True)
    errors = []
    try:
        with sync_playwright() as playwright:
            executable = "/usr/bin/chromium" if Path("/usr/bin/chromium").exists() else "/usr/bin/google-chrome"
            browser = playwright.chromium.launch(executable_path=os.environ.get("ARA_BROWSER_EXECUTABLE", executable), args=["--no-sandbox"])
            page = browser.new_page(viewport={"width": 1440, "height": 1000})
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.route("**/api/v1/cua/devices", lambda route: route.fulfill(content_type="application/json", body=json.dumps([
                {"id": "local_desktop", "name": "Test desktop", "state": "unavailable", "platform": "linux", "resolution": [0, 0],
                 "metadata": {"detail": "Explicit test fixture: driver unavailable; no screen captured."}, "capabilities": []}])))
            page.goto(f"http://127.0.0.1:{system['port']}")
            page.locator("nav").get_by_role("button", name="System Control", exact=True).click()
            expect(page.get_by_role("heading", name="System Control", exact=True)).to_be_visible()
            expect(page.get_by_role("button", name="Snapshot", exact=True)).to_be_disabled()
            expect(page.get_by_role("heading", name="No screen captured", exact=True)).to_be_visible()
            page.get_by_role("button", name="supervised", exact=True).click()
            expect(page.get_by_role("button", name="supervised", exact=True)).to_have_class("active")
            assert c.get("/cua/state", headers=headers).json()["mode"] == "supervised"
            page.get_by_role("button", name="view only", exact=True).click()
            expect(page.get_by_role("button", name="view only", exact=True)).to_have_class("active")
            p = next(p for p in c.get("/profiles").json() if p.get("enabled"))
            page.get_by_label("Agent", exact=True).select_option(p["id"])
            page.get_by_label("Authority", exact=True).select_option("view")
            page.get_by_role("button", name="Save permission", exact=True).click()
            expect(page.get_by_text(p["name"] + ": view", exact=True)).to_be_visible()
            assert c.get("/cua/state", headers=headers).json()["grants"][p["id"]] == ["view"]
            page.screenshot(path=str(output / "system-control-desktop.png"), full_page=True)
            page.set_viewport_size({"width": 390, "height": 844})
            page.wait_for_function("document.querySelector('.sidebar').getBoundingClientRect().right <= 1")
            page.screenshot(path=str(output / "system-control-mobile.png"), full_page=True)
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "System Control overflows mobile"
            assert not errors, errors
            browser.close()
    finally:
        c.put("/cua/state", headers=headers, json={k: original[k] for k in ("mode", "kill_switch", "grants")}).raise_for_status()
