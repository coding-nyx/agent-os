# PRD: Scout Document Upload — Evidence Import for Knowledge Verification

**Module:** Scout (Research & Verification Agent)
**Status:** Draft
**Author:** Product Management (Orchestrator Nexus)
**Created:** 2025-07-11
**Last Updated:** 2025-07-11

---

## 1. Problem Statement

Scout users currently have **three** ways to feed information into their knowledge graph:
1. Typing claims into chat manually
2. Web search via Tavily API (`search_web` action)
3. AI-generated knowledge nodes from conversation context

**What's missing:** Researchers routinely work with **existing documents** — PDFs of journal articles, CSV datasets, plain-text notes, and copied web clippings. Today, they must manually re-type or paste content from these sources. The UI already renders an "Upload Doc" button for Scout, but it has **no `onClick` handler** — it is a dead placeholder that trains users to distrust the interface.

**Core user pain:** A researcher with a 12-page PDF study cannot feed it to Scout for claim extraction and verification without manually copy-pasting sections into chat, losing source provenance in the process.

---

## 2. Proposed Solution

Implement a **document import pipeline** for Scout that:
1. Accepts PDF, CSV, and TXT files via a file picker
2. Parses document content client-side (reusing Soma's `pdfjs-dist` + `papaparse` infrastructure)
3. Injects parsed content into the chat as a structured prompt with research-specific instructions
4. Instructs the LLM to extract claims, assign confidence scores, and create knowledge nodes
5. Sanitizes all file content to prevent prompt injection via `<action>` tags

This follows the **proven pattern** already working in Soma (lab import) and Ledger (CSV import): parse → sanitize → inject as chat message → LLM processes → actions mutate profile.

---

## 3. User Stories

### US-1: Import a Research Document for Claim Extraction

**As a** researcher using Scout,
**I want to** upload a PDF, TXT, or CSV file containing research data,
**So that** Scout can extract verifiable claims and create knowledge nodes from the document without me manually re-typing content.

#### Acceptance Criteria

| # | Criterion | Verification Method |
|---|-----------|-------------------|
| AC-1.1 | **Given** the Scout chat interface is active, **When** the user clicks the "Upload Doc" button, **Then** a native file picker opens accepting `.pdf`, `.csv`, and `.txt` files. | Manual test: click button → file picker opens with correct filter |
| AC-1.2 | **Given** a user selects a valid PDF file (≤10 MB), **When** the file is selected, **Then** text content is extracted from up to 12 pages using `pdfjs-dist` and injected into the chat as a user message. | Unit test: mock PDF → verify extracted text in message |
| AC-1.3 | **Given** a user selects a valid CSV file, **When** the file is selected, **Then** the CSV is parsed via `papaparse` into pipe-delimited rows and injected into the chat. | Unit test: mock CSV → verify parsed output |
| AC-1.4 | **Given** a user selects a valid TXT file, **When** the file is selected, **Then** the raw text is decoded via `TextDecoder('utf-8')` and injected into the chat. | Unit test: mock TXT → verify text output |
| AC-1.5 | **Given** file content is extracted, **When** the content is injected into chat, **Then** all `<action>` tags in the file content are stripped and replaced with `[STRIPPED_ACTION_TAG]` to prevent prompt injection. | Unit test: file with `<action>` tags → verify stripped |
| AC-1.6 | **Given** file content is injected, **When** the LLM processes it, **Then** the prompt instructs the LLM to: (a) extract distinct verifiable claims, (b) assign initial confidence scores, (c) emit `add_knowledge_node` actions for each claim, and (d) set all extracted claims to `status: "pending"`. | Integration test: verify prompt template content |
| AC-1.7 | **Given** a successful import, **When** the LLM responds, **Then** the original filename is preserved as the `source` field on all knowledge nodes created from that document. | Integration test: verify `source` field matches filename |

---

### US-2: Document Size and Safety Guardrails

**As a** system operator,
**I want** document uploads to be validated and bounded,
**So that** malformed or oversized files don't crash the client, exhaust LLM context tokens, or inject malicious prompts.

#### Acceptance Criteria

| # | Criterion | Verification Method |
|---|-----------|-------------------|
| AC-2.1 | **Given** a file larger than 10 MB, **When** the user selects it, **Then** the upload is rejected with a user-visible toast/error: "File too large. Maximum size is 10 MB." The file is NOT processed. | Unit test: 11 MB file → verify rejection |
| AC-2.2 | **Given** a file with an unsupported extension (e.g., `.exe`, `.zip`, `.docx`), **When** the user selects it, **Then** the upload is rejected with an error: "Unsupported file type. Please upload PDF, CSV, or TXT files." | Unit test: `.exe` file → verify rejection |
| AC-2.3 | **Given** extracted text exceeds 30,000 characters, **When** text is prepared for injection, **Then** the text is truncated to 30,000 characters with a note appended: `[DOCUMENT TRUNCATED — first 30,000 characters shown]`. | Unit test: 50K char text → verify truncation + note |
| AC-2.4 | **Given** a PDF that fails to parse (corrupted or image-only), **When** parsing throws an error, **Then** the user sees: "Could not extract text from this PDF. It may be image-based or corrupted." No chat message is sent. | Unit test: corrupted PDF buffer → verify error handling |
| AC-2.5 | **Given** any file content, **When** it is prepared for injection, **Then** the sanitizer strips content matching `/<action\b[^>]*>[\s\S]*?<\/action>/gi` AND also strips any orphaned opening `<action` tags (without a closing pair) to handle malformed injection attempts. Edge case: if truncation at 30K chars splits a tag, the remaining fragment must also be stripped. | Unit test: paired tags, orphaned open tags, orphaned close tags, tags split at truncation boundary → all stripped |

---

### US-3: Source Provenance on Imported Knowledge Nodes

**As a** researcher reviewing my knowledge graph,
**I want to** see which knowledge nodes came from uploaded documents vs. web search vs. manual entry,
**So that** I can assess source quality and trace claims back to their origin.

#### Acceptance Criteria

| # | Criterion | Verification Method |
|---|-----------|-------------------|
| AC-3.1 | **Given** the LLM creates knowledge nodes from an uploaded document, **When** it emits `add_knowledge_node` actions, **Then** the `source` field contains the original filename (e.g., `"climate-study-2024.pdf"`). | Integration test: verify `source` field on created nodes |
| AC-3.2 | **Given** knowledge nodes exist with file-based sources, **When** they are displayed in the ScoutDashboard, **Then** their provenance is distinguishable (the source/filename is visible on the node display or accessible to the user via chat context). | Manual test: verify filename visible |
| AC-3.3 | **Given** a document produces multiple claims, **When** knowledge nodes are created, **Then** each node is created as a separate `add_knowledge_node` action with its own confidence score (not bundled into one mega-node). | Integration test: multi-claim doc → verify multiple distinct nodes |

---

### US-4: Graceful Handling of Empty and Edge-Case Files

**As a** user who may accidentally select the wrong file,
**I want** clear feedback when my upload can't be processed,
**So that** I understand what happened and can try again.

#### Acceptance Criteria

| # | Criterion | Verification Method |
|---|-----------|-------------------|
| AC-4.1 | **Given** an empty file (0 bytes), **When** the user selects it, **Then** the upload is rejected with: "This file appears to be empty." | Unit test: 0-byte file → verify rejection |
| AC-4.2 | **Given** the user opens the file picker but cancels without selecting, **When** the dialog closes, **Then** nothing happens — no error, no state change. | Manual test: open picker → cancel → no side effects |
| AC-4.3 | **Given** a CSV with only headers and no data rows, **When** it is parsed, **Then** Scout still processes it (headers may contain useful schema info) but the LLM is informed: "Note: CSV contains headers only, no data rows." | Unit test: header-only CSV → verify note appended |
| AC-4.4 | **Given** an upload is in progress, **When** the user clicks the upload button again, **Then** the new upload replaces the in-progress one (no duplicate submissions). | Manual test: rapid double-click → only one message sent |
| AC-4.5 | **Given** the knowledge graph already has ≥240 nodes, **When** a document import would create nodes that push the total past 250, **Then** the LLM prompt includes the current node count and instructs: "Knowledge graph has {N}/250 nodes. Limit extraction to the {250-N} most significant claims." Existing nodes are never silently dropped by an import. | Unit test: verify prompt includes node count when ≥200 nodes exist |

---

## 4. Feature Scope

### v1 — MVP (This Sprint)

| Feature | Detail |
|---------|--------|
| **File types** | `.pdf`, `.csv`, `.txt` |
| **Parsing** | Reuse Soma's `parseLabFile()` or extract a shared utility from it |
| **Content injection** | Chat message with Scout-specific research prompt |
| **Sanitization** | Strip `<action>` tags (same pattern as Soma) |
| **Size limit** | 10 MB file size, 30,000 character text cap, CSV capped at first 500 rows before text truncation |
| **Error handling** | Toast messages for rejection, graceful parse failures |
| **Source tracking** | Filename stored in `source` field on knowledge nodes |
| **UI** | Wire the existing placeholder "Upload Doc" button in `ScoutPage.tsx` via `renderCustomActions` |

### v2 — Future Iteration

| Feature | Detail |
|---------|--------|
| **Markdown support** | `.md` files with front-matter parsing |
| **DOCX support** | Would require adding `mammoth` or similar dependency |
| **Multi-file upload** | Batch import multiple documents in one action |
| **Firebase Storage persistence** | Store uploaded files in Storage for later reference |
| **Citation extraction** | Parse bibliography/references sections to auto-populate `sources[]` |
| **Image-based PDF OCR** | Tesseract.js for scanned documents (heavy dependency, out of MVP) |
| **Drag-and-drop** | Drop zone on the chat interface |
| **URL paste-to-import** | Paste a URL → fetch content → parse as document |
| **Evidence attachments on nodes** | Link stored documents directly to knowledge node records |

---

## 5. Technical Architecture

### 5.1 Implementation Pattern

Follow the **exact pattern** proven in Soma and Ledger:

```
User clicks button
  → Native file input created programmatically
  → File selected
  → Client-side validation (size, type)
  → Client-side parsing (pdfjs-dist / papaparse / TextDecoder)
  → Content sanitization (strip <action> tags)
  → Content truncation (30K char limit)
  → Structured prompt assembly
  → handleSendMessage() injects into chat
  → LLM processes and emits add_knowledge_node actions
  → Actions mutate ScoutProfile via existing action handlers
```

### 5.2 Shared Parsing Utility

**Decision point:** Soma's `lab-import-service.ts` already implements PDF/CSV/TXT parsing. Two options:

| Option | Pros | Cons |
|--------|------|------|
| **A. Import Soma's `parseLabFile` directly** | Zero new code, DRY | Cross-module dependency (Scout → Soma). Tight coupling. |
| **B. Extract shared utility to `src/lib/file-parser.ts`** | Clean architecture, reusable by Forge too | Requires refactoring Soma's import to use shared utility |

**Recommendation:** Option **B** — extract to `src/lib/file-parser.ts`. The parsing logic is module-agnostic (it's just PDF/CSV/TXT → text). Scout's unique logic is the *prompt template*, not the *parsing*. This also benefits Forge, which has the same placeholder button problem.

### 5.3 Scout-Specific Prompt Template

The injected prompt must be research-oriented (unlike Soma's biomarker-oriented prompt):

```
Document import received: {filename} ({mime}).
Analyze this document as a research source:
1. Extract all distinct, verifiable claims from the content.
2. For each claim, emit a separate <action type="add_knowledge_node"> with:
   - title: concise claim summary
   - claim: the full assertion
   - confidence: initial score based on source quality (0.0-1.0)
   - source: "{filename}"
   - status: "pending"
3. After extracting claims, provide a synthesis summary of the document's key findings.
4. Flag any claims that contradict existing knowledge nodes.
5. If the document references other sources, note them for potential web verification.

---BEGIN DOCUMENT---
{sanitized_content}
---END DOCUMENT---
```

### 5.4 Where to Wire the Button

Scout uses `UnifiedModulePage` (for profile lifecycle) which renders `ScoutContent`, which renders `NexusChat`. `NexusChat` already accepts a `renderCustomActions` prop and passes it through to `ChatInterface` — this is the **exact same pattern** used by Soma and Ledger for their working import buttons.

**Implementation:** Add the file upload button as `renderCustomActions` on the `NexusChat` component inside `ScoutContent`. This will render the working button **alongside** the existing ChatInterface placeholder buttons (which remain visible for other modules).

> **Note:** The ChatInterface renders placeholder buttons (Upload Doc, Data CSV, Web Research) with no handlers AND any `renderCustomActions()` output. OQ-5 tracks whether placeholders should be hidden when a module provides custom actions. For v1, accept coexistence — the custom button has a distinct label ("Import Research Doc") to avoid confusion.

---

## 6. Edge Cases & Risks

### 6.1 Technical Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| **LLM context overflow** | High | 30,000 character truncation limit. A 12-page PDF typically produces ~5,000–15,000 chars of text. Monitor actual usage. |
| **Prompt injection via file content** | Critical | Strip ALL `<action>` tag variants. Soma's regex pattern: `/<action\b[^>]*>[\s\S]*?<\/action>/gi`. Audit for edge cases (nested tags, partial tags, unicode obfuscation). |
| **Image-only PDFs produce empty text** | Medium | Detect empty extraction result → show clear error message. Do NOT send empty content to LLM. |
| **Large CSV overwhelming the LLM** | Medium | 30K char truncation handles this. CSV is also capped at first 500 data rows before character truncation is applied. |
| **pdfjs-dist worker loading failure** | Low | Soma's worker is already configured. Reuse same worker setup. Handle `getDocument()` promise rejection. |
| **Guest mode (no auth)** | Medium | File parsing is 100% client-side — works without auth. Profile saves use localStorage for guests (existing pattern). No Firebase Storage needed for v1. |
| **Race condition: rapid uploads** | Low | Disable button during processing or debounce. Prevent duplicate chat messages. |

### 6.2 Product Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Users expect OCR for scanned PDFs** | Medium | Clear error message when no text extracted. Consider adding to v2 backlog. |
| **Users expect the file to be "stored" somewhere** | Medium | v1 is parse-and-discard. Clarify in UI that documents are processed but not stored. Add Firebase Storage persistence in v2. |
| **LLM hallucinates claims not in the document** | High | Persona instructions already say "NEVER fabricate sources." Prompt template should reinforce: "Extract ONLY claims explicitly stated in the document." |
| **Knowledge node explosion from large documents** | Medium | Existing 250-node cap in `actions.ts` (`slice(0, 250)`). LLM prompt should instruct: "Focus on the 5-10 most significant claims." |
| **No way to undo a bad import** | Medium | Out of scope for v1. User can manually delete nodes in chat. Consider batch-undo in v2. |

### 6.3 Security Considerations

| Concern | Status |
|---------|--------|
| File content never leaves the browser (client-side parsing) | ✅ By design |
| File content sent to LLM API as chat message | ⚠️ Same trust boundary as any user message. Acceptable. |
| No files stored in Firebase Storage in v1 | ✅ Minimal attack surface |
| Action tag injection prevention | ✅ Regex sanitization (proven in Soma) |
| File type validation (extension + MIME) | 🔧 Must validate BOTH extension and MIME type |

---

## 7. Priority & Dependencies

### 7.1 Dependencies (Must Exist First)

| Dependency | Status | Notes |
|------------|--------|-------|
| `pdfjs-dist` package | ✅ Already installed | v5.5.207 in `package.json` |
| `papaparse` package | ✅ Already installed | v5.5.3 in `package.json` |
| PDF worker configuration | ✅ Already configured | Soma sets `GlobalWorkerOptions.workerSrc` |
| Scout action handlers | ✅ Already registered | `add_knowledge_node`, `verify_claim`, etc. |
| Scout persona / system prompt | ✅ Already defined | May need minor update for document context |
| `handleSendMessage` in ScoutContent | ✅ Already available | From `useModuleAI` hook |
| ChatInterface `canUploadDocs` flag | ✅ Already true for scout | Line 269 of ChatInterface.tsx |

### 7.2 Priority Assessment

| Factor | Assessment |
|--------|-----------|
| **User Value** | **High** — Unblocks the primary research workflow (document-based investigation). Eliminates the most common manual step. |
| **Technical Complexity** | **Low** — 90% of the infrastructure exists. The parsing code is proven in Soma. The injection pattern is proven in Ledger. This is primarily wiring + a new prompt template. |
| **Effort Estimate** | **Small** (~2-4 hours for a developer familiar with the codebase) |
| **Risk** | **Low** — No new dependencies. No backend changes. No data model changes. |
| **Strategic Value** | **High** — Eliminates a dead placeholder button that actively undermines user trust. Brings Scout to feature parity with Soma/Ledger for document input. |

**Recommendation:** **P1 — Do this next.** The effort-to-value ratio is exceptional. All dependencies are met. The dead button is a UX liability every time a user sees it.

### 7.3 Suggested Implementation Order

```
1. Extract shared file parser → src/lib/file-parser.ts (refactor from Soma)
2. Create Scout document import handler → src/modules/scout/services/scout-doc-import.ts
3. Wire button in ScoutPage.tsx via renderCustomActions or NexusChat prop
4. Update Soma to import from shared parser (cleanup)
5. Write unit tests for parser + sanitization + truncation
6. Manual E2E test with real PDF/CSV/TXT files
```

---

## 8. Out of Scope (Explicit Exclusions)

The following are **explicitly NOT part of this feature** and should not be built, discussed, or designed during implementation:

| Exclusion | Rationale |
|-----------|-----------|
| **Firebase Storage file persistence** | v1 is parse-and-discard. No files are stored. Persistence is a v2 concern. |
| **OCR for image-based PDFs** | Requires Tesseract.js (~10 MB dependency). Out of MVP scope. |
| **DOCX/XLSX/PPTX support** | Requires `mammoth`/`xlsx` dependencies. Out of MVP scope. |
| **Drag-and-drop upload** | UX enhancement for v2. Button-click is sufficient for MVP. |
| **File preview/thumbnail** | Not needed for research workflow. Parse and extract, don't display. |
| **Multi-file batch upload** | v1 handles one file at a time. Batch is a v2 feature. |
| **Document storage/retrieval UI** | Scout is not a file manager. Documents are evidence sources, not assets. |
| **URL-to-document import** | Interesting feature, but separate scope. Web search already covers URL-based research. |
| **Modifying the ScoutProfile data model** | No new fields needed. Existing `source` field on `ScoutKnowledgeNode` is sufficient. |
| **Changes to the ScoutDashboard** | Dashboard already displays knowledge nodes with their sources. No UI changes needed. |
| **Changes to ChatInterface.tsx placeholder buttons** | The generic placeholder buttons remain as-is. Scout's working button is added via `renderCustomActions` and coexists with them. OQ-5 tracks potential cleanup. |
| **Forge document upload** | Same placeholder problem exists, but separate scope. Shared parser benefits Forge later. |

---

## 9. Success Metrics

| Metric | Target | How to Measure |
|--------|--------|---------------|
| Upload button has a working handler | 100% | Code review: `onClick` handler exists and triggers file picker |
| PDF/CSV/TXT files are parseable | 100% of supported formats | Unit tests pass for each format |
| Knowledge nodes are created from documents | ≥1 node per non-empty document | Integration test: upload → verify node count > 0 |
| No prompt injection possible via file content | 0 action tag passthrough | Security test: files with `<action>` tags → verify stripped |
| Parse errors surface user-friendly messages | 100% of error paths | Unit tests: each error path → verify toast/message |

---

## 10. Open Questions

| # | Question | Owner | Impact |
|---|----------|-------|--------|
| OQ-1 | Should the shared file parser live in `src/lib/` or `src/core/services/`? | Developer/Architect | Low — naming convention only |
| OQ-2 | Does `NexusChat` accept a `renderCustomActions` prop, or does the button need to be wired differently? | Developer | Medium — affects implementation approach |
| OQ-3 | Should the 30K character limit be configurable per module, or hardcoded? | Product | Low — hardcode for now, parameterize if needed |
| OQ-4 | Should we limit extracted knowledge nodes per document (e.g., max 10 per import)? | Product | Medium — prevents node explosion but may lose info |
| OQ-5 | Should the placeholder buttons in ChatInterface.tsx be hidden when a module provides `renderCustomActions`? | Design | Low — cosmetic, but avoids button duplication |

---

## Appendix A: File Flow Diagram

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│  User clicks │     │  File Picker  │     │  Client-side     │
│  "Upload Doc"│────▶│  (PDF/CSV/TXT)│────▶│  Validation      │
│  button      │     │              │     │  (size, type)    │
└──────────────┘     └──────────────┘     └────────┬─────────┘
                                                    │
                                          ┌─────────▼──────────┐
                                          │  Client-side Parse  │
                                          │  (pdfjs / papa /    │
                                          │   TextDecoder)      │
                                          └─────────┬──────────┘
                                                    │
                                          ┌─────────▼──────────┐
                                          │  Sanitize + Truncate│
                                          │  (strip <action>,   │
                                          │   cap at 30K chars) │
                                          └─────────┬──────────┘
                                                    │
                                          ┌─────────▼──────────┐
                                          │  Build Research     │
                                          │  Prompt + Inject    │
                                          │  via handleSendMsg  │
                                          └─────────┬──────────┘
                                                    │
                                          ┌─────────▼──────────┐
                                          │  LLM Processes      │
                                          │  → Extracts Claims  │
                                          │  → Emits Actions    │
                                          └─────────┬──────────┘
                                                    │
                                          ┌─────────▼──────────┐
                                          │  ActionHub routes   │
                                          │  add_knowledge_node │
                                          │  → Profile updated  │
                                          └─────────────────────┘
```

## Appendix B: Cross-Module Pattern Comparison

| Aspect | Soma (Lab Import) | Ledger (CSV Import) | Scout (Proposed) |
|--------|-------------------|---------------------|------------------|
| **Trigger** | Custom button via `renderCustomActions` | Custom button via `renderCustomActions` | Custom button via `renderCustomActions` or NexusChat prop |
| **File types** | `.pdf`, `.csv`, `.txt` | `.csv`, `.txt` | `.pdf`, `.csv`, `.txt` |
| **Parser** | `parseLabFile()` — pdfjs + papaparse | `FileReader.readAsText()` | Shared `parseResearchFile()` — pdfjs + papaparse |
| **Sanitization** | Strips `<action>` tags | None ⚠️ | Strips `<action>` tags |
| **Prompt focus** | Biomarker extraction | Raw text passthrough | Claim extraction + confidence scoring |
| **Output actions** | `propose_draft` (soma_import) | LLM-determined | `add_knowledge_node` (multiple) |
| **Page size cap** | 12 pages (PDF) | N/A | 12 pages (PDF) + 30K char total |
