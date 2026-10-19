import os
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


def test_specialist_workspaces_preferences_and_planning(system):
    output = Path(__file__).resolve().parents[1] / "test-results"
    output.mkdir(exist_ok=True)
    errors = []
    with sync_playwright() as playwright:
        executable = "/usr/bin/chromium" if Path("/usr/bin/chromium").exists() else "/usr/bin/google-chrome"
        browser = playwright.chromium.launch(executable_path=os.environ.get("ARA_BROWSER_EXECUTABLE", executable), args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 1440, "height": 1060})
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(f"http://127.0.0.1:{system['port']}")
        page.locator("nav").get_by_role("button", name="Agents", exact=False).click()
        expect(page.get_by_role("heading", name="Your agents", exact=True)).to_be_visible()
        expect(page.get_by_role("button", name="Open agent Agnes", exact=True)).to_be_visible()
        expect(page.get_by_role("button", name="Open agent Atlas", exact=True)).to_be_visible()
        assert page.get_by_role("button", name="Open agent Orchestrator", exact=True).count() == 0
        assert page.get_by_role("button", name="Open agent Soma", exact=True).count() == 0
        page.screenshot(path=str(output / "agents-directory.png"), full_page=True)

        page.get_by_role("button", name="Open agent Agnes", exact=True).click()
        expect(page.get_by_role("heading", name="Emotional support & reflection", exact=True)).to_be_visible()
        page.get_by_role("tab", name="Setup", exact=True).click()
        page.get_by_label("What would you like support with?").fill("Understand stress patterns at my own pace")
        page.get_by_label("Preferred session style").select_option("casual")
        page.get_by_label("Body awareness prompts").select_option("off")
        page.get_by_role("button", name="Save agent preferences", exact=True).click()
        expect(page.get_by_role("status")).to_contain_text("Preferences saved for new conversations")
        agnes = next(p for p in system["client"].get("/profiles").json() if p["preset"] == "agnes" and p["name"] == "Agnes")
        soul = system["state"] / "runtime/profiles" / agnes["native_name"] / "SOUL.md"
        assert "Understand stress patterns at my own pace" in soul.read_text()
        page.get_by_role("tab", name="Workspace", exact=True).click()
        page.screenshot(path=str(output / "agnes-workspace.png"), full_page=True)
        page.get_by_role("button", name="I would like a gentle check-in", exact=True).click()
        expect(page.get_by_role("textbox", name="Message agent")).to_have_value("I would like a gentle check-in")

        page.get_by_role("button", name="All agents", exact=True).click()
        page.get_by_role("button", name="Open agent Atlas", exact=True).click()
        page.get_by_role("button", name="Create planning dataset", exact=True).click()
        page.get_by_role("button", name="New task", exact=True).click()
        page.get_by_label("Task or goal", exact=True).fill("A manageable next step")
        page.get_by_label("Next steps", exact=True).fill("Work for twenty focused minutes")
        page.get_by_role("button", name="Save task", exact=True).click()
        expect(page.get_by_role("heading", name="A manageable next step", exact=True)).to_be_visible()
        page.get_by_role("combobox", name="Status for A manageable next step", exact=True).select_option("done")
        expect(page.locator(".planning-column").nth(2).get_by_role("heading", name="A manageable next step", exact=True)).to_be_visible()
        page.screenshot(path=str(output / "atlas-workspace.png"), full_page=True)
        page.set_viewport_size({"width": 390, "height": 844})
        page.wait_for_function("document.querySelector('.sidebar').getBoundingClientRect().right <= 1")
        page.screenshot(path=str(output / "atlas-workspace-mobile.png"), full_page=True)
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "Agent workspace overflows on mobile"
        assert not errors, errors
        browser.close()
