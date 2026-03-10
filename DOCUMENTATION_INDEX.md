# Nexus Documentation Index

**Central hub for all project documentation**  
**Last Updated:** 2026-03-10

---

## 🚀 Quick Start for New Developers

1. **Read first:** [CODE_DOCUMENTATION.md](CODE_DOCUMENTATION.md) (5 min)
2. **Then read:** [AGENTS.md](AGENTS.md) (5 min)
3. **Explore modules:** Pick a module in `src/modules/` and read its README.md (2 min)
4. **Install git hooks:** Run `npm run install-doc-hooks` to auto-remind on commits

**Total onboarding time:** ~12 minutes to be productive

---

## 📚 Documentation Structure

### Tier 1: Architecture & Standards
High-level system design and protocols.

| Document | Purpose | Audience | Read Time |
|----------|---------|----------|-----------|
| [CODE_DOCUMENTATION.md](CODE_DOCUMENTATION.md) | Complete system overview, data flows, patterns | All developers, AI assistants | 5 min |
| [AGENTS.md](AGENTS.md) | AI agent protocol, mandates, architecture map | All developers, AI assistants | 5 min |
| [README.md](README.md) | Project overview, setup instructions | New developers | 3 min |

### Tier 2: Layer-Specific Guides
Deep dives into specific architectural layers.

| Document | Purpose | Read Time |
|----------|---------|-----------|
| [src/lib/README.md](src/lib/README.md) | Shared runtime (services, contexts, spine, vault) | 5 min |
| [src/llm-engine/README.md](src/llm-engine/README.md) | AI engine interface and usage | 4 min |
| [src/core/README.md](src/core/README.md) | Reusable UI components and design system | 5 min |

### Tier 3: Module Documentation
Feature-specific implementation details.

| Module | Document | Purpose |
|--------|----------|---------|
| **Template** | [src/modules/MODULE_README_TEMPLATE.md](src/modules/MODULE_README_TEMPLATE.md) | Copy this for new modules |
| **Agnes** | `src/modules/agnes/README.md` | Mental wellness therapy module |
| **Titan** | `src/modules/titan/README.md` | Fitness coaching module |
| **Ledger** | `src/modules/ledger/README.md` | Clinical health records |
| **Soma** | `src/modules/soma/README.md` | Physical readiness clearance |
| **Atlas** | `src/modules/atlas/README.md` | Energy mapping |
| **Scout** | `src/modules/scout/README.md` | External data exploration |
| **Forge** | `src/modules/forge/README.md` | Habit formation |
| **Hub** | `src/modules/hub/README.md` | 3D visualization command center |
| **Orchestrator** | `src/modules/orchestrator/README.md` | Onboarding (Nyx AI) |
| **Profile** | `src/modules/profile/README.md` | User settings |

> **Note:** Module READMEs are created on-demand. Use the template to create missing ones.

### Tier 4: Specialized Documentation
Domain-specific deep dives.

| Document | Purpose | Location |
|----------|---------|----------|
| Vault Architecture | E2EE implementation details | `docs/architecture/VAULT_ARCHITECTURE.md` |
| Spine Event System | Event bus and cascade rules | `docs/architecture/SPINE_ARCHITECTURE.md` |
| AI Integration Guide | Advanced AI patterns | `docs/architecture/AI_INTEGRATION.md` |
| Performance Guide | Optimization strategies | `docs/performance/OPTIMIZATION_GUIDE.md` |
| Security Guide | Security best practices | `docs/security/SECURITY.md` |

> **Note:** Specialized docs are created as needed. See `docs/` directory.

---

## 🔍 Finding What You Need

### I want to...

| Task | Read This | Time |
|------|-----------|------|
| **Understand the overall architecture** | CODE_DOCUMENTATION.md | 5 min |
| **Add a new feature to a module** | Module's README.md + CODE_DOCUMENTATION.md § Feature Addition Checklist | 3 min |
| **Create a new module** | MODULE_TEMPLATE.md + AGENTS.md § Module Domains | 5 min |
| **Use the AI engine** | src/llm-engine/README.md | 4 min |
| **Create a reusable UI component** | src/core/README.md | 5 min |
| **Add a new service** | src/lib/README.md § Services | 3 min |
| **Understand data encryption** | src/lib/README.md § Vault System | 3 min |
| **Set up cross-module coordination** | src/lib/README.md § Spine Event Bus | 3 min |
| **Debug an issue** | CODE_DOCUMENTATION.md § Debugging Guide | 2 min |
| **Follow code standards** | AGENTS.md § Engineering Standards | 3 min |

---

## 🤖 For LLM Code Assistants

### Context Budget Strategy

**If limited context, read in this priority order:**

1. **CODE_DOCUMENTATION.md** (5 min) - System overview, patterns, quick reference
2. **AGENTS.md** (5 min) - Mandates, architecture map, standards
3. **Target module README.md** (1-2 min) - Feature-specific details
4. **Relevant service/component docs** (2 min) - Implementation specifics

**Total:** ~13 minutes to full productivity

### Key Principles to Internalize

```typescript
// 1. Module Isolation
// ❌ WRONG: Module logic in global provider
const GlobalSoulProvider = () => {
  const [titanData, setTitanData] = useState();
};

// ✅ RIGHT: Module logic stays in module
// src/modules/titan/services/titan-service.ts

// 2. LLM Engine Boundary
// ❌ WRONG: Direct engine import
import { Agent } from '@/llm-engine/engine/Agent';

// ✅ RIGHT: Use provided hooks
const { sendMessage } = useAI();

// 3. Encryption Pattern
// ❌ WRONG: Plaintext persistence
await db.collection('profiles').doc(id).set(data);

// ✅ RIGHT: Encrypted persistence
const key = await vault.getModuleKey('module');
const encrypted = await encryptWithKey(data, key);
await db.collection('profiles').doc(id).set(encrypted);

// 4. Concurrency Safety
// ❌ WRONG: Direct state mutation
setState(newValue);

// ✅ RIGHT: Functional update
setState(prev => ({ ...prev, field: newValue }));

// 5. Component Reusability
// ❌ WRONG: Duplicate components
// TherapyChatInterface.tsx, FitnessChatInterface.tsx

// ✅ RIGHT: Configurable component
<ChatInterface variant="therapy" />
```

---

## 📝 Documentation Maintenance

### Maintenance Protocol

| When | What to Update | How |
|------|----------------|-----|
| **New module** | Create module/README.md from template | Use MODULE_TEMPLATE.md |
| **New service** | Add to src/lib/README.md | Follow service pattern |
| **New component** | Add to src/core/README.md | Include JSDoc + example |
| **Architecture change** | Update AGENTS.md + CODE_DOCUMENTATION.md | Full section rewrite |
| **Bug fix** | Optional (only if pattern changed) | Update relevant README |
| **Refactor** | Update all affected READMEs | Atomic commit with code |

### Git Hook Installation

```bash
# Install documentation reminder hook
npm run install-doc-hooks

# This will prompt you before each commit if documentation should be updated
```

### Commit Format
```bash
git commit -m "feat(module): Add feature
- Implementation details
- Update module/README.md with new feature
- Update CODE_DOCUMENTATION.md if architecture changed"
```

---

## 🎯 Quality Checklist

Before considering documentation "complete":

### Accuracy
- [ ] All code examples are tested and work
- [ ] All file paths are correct
- [ ] All type definitions match actual code
- [ ] All API references are current

### Completeness
- [ ] Purpose statement is clear
- [ ] Usage examples are provided
- [ ] Common patterns are documented
- [ ] Edge cases and gotchas are noted
- [ ] Dependencies are listed

### Usability
- [ ] Written for the target audience (developer vs AI assistant)
- [ ] Read time is estimated accurately
- [ ] Navigation links work
- [ ] Code examples are syntax-highlighted
- [ ] Accessibility considerations noted (for UI components)

### Maintainability
- [ ] "Last Updated" date is current
- [ ] "Update this when" section lists triggers
- [ ] Related docs are cross-referenced
- [ ] Follows established template/format

---

## 🛠 Documentation Tools

### Scripts
- `npm run install-doc-hooks` - Install git hook for documentation reminders
- `scripts/pre-commit-doc-check.sh` - Pre-commit hook source

### Templates
- `src/modules/MODULE_README_TEMPLATE.md` - Module documentation template
- (Add more templates as needed)

### External Tools
- **Markdown Preview:** VS Code built-in or GitHub preview
- **Link Checker:** (Future) Automated link validation
- **Doc Generator:** (Future) Auto-generate API docs from JSDoc

---

## 📖 Documentation Philosophy

### Why This System Exists

Traditional documentation becomes stale and scattered. This system:

1. **Centralizes** all docs in the repo (not external wikis)
2. **Layers** information by depth (quick start → deep dive)
3. **Automates** reminders (git hooks prevent drift)
4. **Optimizes** for LLM consumption (low-context, high-signal)

### Documentation First, Not Last

- Document WHILE building, not after
- Code comments explain "why", docs explain "how" and "what"
- Every PR should include doc updates
- Docs are part of the definition of "done"

### Living Documentation

- Docs evolve with the code
- Out-of-date docs are worse than no docs
- Delete obsolete docs immediately
- Prefer accuracy over completeness

---

## 🆘 Getting Help

### Documentation Issues
If you find:
- **Broken links** → Fix and commit
- **Outdated info** → Update and commit
- **Missing docs** → Create from template
- **Unclear sections** → Ask team, then improve

### Contributing to Docs
All developers and AI assistants can improve documentation:

1. Read the existing doc
2. Make improvements (clarity, examples, corrections)
3. Follow the established format
4. Commit with descriptive message
5. No approval needed for doc-only changes

---

## 📚 External Resources

- **React 19:** https://react.dev
- **TypeScript:** https://www.typescriptlang.org/docs/
- **Tailwind CSS:** https://tailwindcss.com/docs
- **Framer Motion:** https://www.framer.com/motion/
- **Firebase:** https://firebase.google.com/docs
- **Web Crypto API:** https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API
- **WCAG Accessibility:** https://www.w3.org/WAI/WCAG21/quickref/

---

## 📊 Documentation Metrics

### Coverage Status

| Layer | Docs Exist | Complete | Needs Work |
|-------|------------|----------|------------|
| Architecture (Tier 1) | ✅ | ✅ | - |
| Shared Runtime (Tier 2) | ✅ | ✅ | - |
| LLM Engine (Tier 2) | ✅ | ✅ | - |
| Core Components (Tier 2) | ✅ | ✅ | - |
| Modules (Tier 3) | ⚠️ Partial | ⚠️ As needed | Use template |
| Specialized (Tier 4) | ⚠️ Partial | ⚠️ As needed | On-demand |

### Legend
- ✅ Complete and current
- ⚠️ Partial (create on-demand using templates)
- ❌ Missing (needs creation)

---

**Maintained by:** Development Team + AI Assistants  
**Questions?** See AGENTS.md for contact info  
**Last Review:** 2026-03-10
