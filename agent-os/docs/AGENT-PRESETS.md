# Agent roles and Hermes configuration

The agent catalog follows the main branch's `src/lib/module-manifest.ts` and
`src/core/intake/onboarding-configs.ts`, checked against `origin/main` at
`b4d844a` (including its Agnes settings and engagement modes).

| Preset | Main-branch responsibility | Agent OS surface |
| --- | --- | --- |
| Ara | System orchestrator | Day planning, explicit specialist delegation, outcome inspection |
| Agnes | Emotional support | Reflective check-ins, optional grounding, private reflection journal |
| Titan | Training and recovery | Training baseline, recorded workouts and equipment/recovery context |
| Ledger | Personal finance | Currency/planning preferences, exact transaction records and dataset access |
| Atlas | Planning and focus | Focus preferences, goals, task board and explicit status changes |
| Scout | Research | Evidence/output preferences, sources and saved findings |

Ara is the orchestrator, not a separate peer of another default Orchestrator agent.
Soma (main's health domain) and Forge (development) are deferred in this release.
The old Agent OS catalog incorrectly assigned reflection to Soma and omitted Agnes
and Atlas. Existing Soma and Orchestrator profiles are retained with their histories,
credentials and data bindings, and shown under Previous profiles. Nothing is merged
or deleted. Native `hermes profiles` can still inspect all retained native homes.

## Configuration ownership

Each workspace has a Setup form derived from its preset's intake fields, plus the
existing native model/account, tools, skills, memory, automation and voice controls.
Validated preferences are stored in the application profile and rendered into a
marked section of that profile's native `SOUL.md`. Unmanaged identity text is
preserved. Revision and identity-hash checks reject stale edits. Existing sessions
keep their frozen context; changes apply to new conversations.

No model, account credential, dataset grant or specialist grant is borrowed from
another agent. Installation onboarding can explicitly configure a native-root
provider/model for all six presets with one login. Root credential-pool fallback
is owned by Hermes; rotating OAuth grants are not cloned. Existing individual
choices are preserved unless replacement is confirmed, and extra instances and
retained profiles are not bulk targets. Per-agent overrides remain supported.
Personalizing an agent does not start inference. Starter prompts
open editable drafts, and new datasets are bound read-only until the user changes
the permission. Reflection datasets use the same private-channel restrictions as
the existing notebook data module.

Agnes's casual/deep/somatic preferences are instructions for the native agent;
they do not add a second session engine. An impromptu/off-the-record mode from
main is not offered because this runtime persists its sessions. Atlas's task board
stores planning records; reminders remain separate native Automations.

## Migration and verification

Startup seeds each missing current preset even when other profiles already exist.
It appends the current role specification once to existing native identities while
preserving user edits and credentials. Versioned preset application avoids rewriting
identity on every restart. Old profiles remain inspectable under Previous profiles.

`tests/test_agent_configuration.py` covers partial-install backfill, repeat seeding,
legacy preservation, validated preferences, stale edits and data modules.
`tests/test_agent_ui.py` exercises Agnes setup, draft prompts, Atlas task creation,
task completion and mobile layout through the real API and native profile files.

`tests/test_preset_workflows.py` configures each of the six recommended roles in a
disposable installation and runs its real native session through scoped MCP dataset
discovery. The deterministic provider verifies integration, not reasoning quality or
live account availability. No preferences, credentials or dataset grants from those
tests are applied to the user's profiles.

Legacy empty-model sessions have an explicit, history-preserving fresh-conversation
action. Native policies are immutable; configuring a model changes new sessions,
not the frozen settings of an already-created conversation. This recovery never
automatically resubmits work. Account login remains explicit for every profile;
selecting ChatGPT does not copy another profile's OAuth tokens.

Native configuration is authoritative for model and protocol selection, even after
CLI changes. Cached application connection labels cannot resurrect a removed model
or silently route a new conversation through an older selection. Preference forms,
data permissions and existing frozen session policies are independent of this lookup.
