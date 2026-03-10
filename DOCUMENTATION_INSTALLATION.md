# Documentation System Installation Guide

**Quick setup for the new documentation system**

---

## ✅ Installation Steps

### 1. Install Git Hooks (Recommended)

Run this command to enable automatic documentation reminders:

```bash
npm run install-doc-hooks
```

This will:
- Install a pre-commit hook that checks for documentation updates
- Prompt you before each commit if docs might need updating
- Help maintain documentation freshness automatically

### 2. Make Scripts Executable (Unix/Mac)

If you're on Mac/Linux and the scripts aren't executable:

```bash
chmod +x scripts/install-doc-hooks.sh
chmod +x scripts/pre-commit-doc-check.sh
```

### 3. Review Key Documents

Take 15 minutes to read these essential docs:

```bash
# 1. System overview (5 min)
cat CODE_DOCUMENTATION.md

# 2. Agent protocol (5 min)  
cat AGENTS.md

# 3. Quick reference (2 min)
cat QUICK_REFERENCE.md

# 4. Documentation index (3 min)
cat DOCUMENTATION_INDEX.md
```

---

## 📚 What You Get

### Documentation Files
- ✅ `CODE_DOCUMENTATION.md` - Complete system overview
- ✅ `DOCUMENTATION_INDEX.md` - Central documentation hub
- ✅ `QUICK_REFERENCE.md` - Printable cheat sheet
- ✅ `src/lib/README.md` - Shared runtime layer docs
- ✅ `src/llm-engine/README.md` - AI engine interface docs
- ✅ `src/core/README.md` - UI components and design system
- ✅ `src/modules/MODULE_README_TEMPLATE.md` - Template for modules
- ✅ `docs/DOCUMENTATION_SYSTEM_SUMMARY.md` - System overview

### Automation Tools
- ✅ Git pre-commit hook (reminds about documentation)
- ✅ Installation script (`npm run install-doc-hooks`)
- ✅ Package.json script integration

---

## 🎯 Quick Start

### For Human Developers

**Day 1:**
```bash
# Install hooks
npm run install-doc-hooks

# Read core docs (12 min)
open CODE_DOCUMENTATION.md
open AGENTS.md
open QUICK_REFERENCE.md

# Bookmark for daily use
# → QUICK_REFERENCE.md
```

**Ongoing:**
- Git hook will remind you to update docs when needed
- Reference QUICK_REFERENCE.md for common patterns
- Create module READMEs using the template as needed

### For LLM Code Assistants

**Context Loading Strategy:**
```
1. Read CODE_DOCUMENTATION.md (5 min)
2. Read AGENTS.md (5 min)
3. Read target module README (1-2 min)
4. Read relevant service docs (2 min)

Total: ~13 minutes to productivity
```

**Key Principles to Internalize:**
- Module isolation (keep module logic in module dir)
- LLM engine boundary (interact via hooks only)
- E2EE pattern (always encrypt sensitive data)
- Concurrency safety (functional state updates)
- Component reusability (no duplication)

---

## 🔧 Customization

### Modify Git Hook Behavior

Edit `scripts/pre-commit-doc-check.sh` to:
- Add more file patterns to check
- Change reminder messages
- Adjust strictness (prompt vs block)

### Add Module Documentation

When creating a new module:

```bash
# Copy template
cp src/modules/MODULE_README_TEMPLATE.md src/modules/my-module/README.md

# Customize with your module details
# - Replace {Module} placeholders
# - Add actual components and services
# - Document AI personas and actions
# - List Spine events
```

### Create Specialized Docs

For deep dives on specific topics:

```bash
# Create in docs/ directory
mkdir -p docs/architecture
touch docs/architecture/MY_TOPIC.md

# Follow format:
# - Clear title and purpose
# - Estimated read time
# - Code examples
# - Cross-references
```

---

## 🚀 Verification

### Test Git Hook

```bash
# Make a code change to a module
echo "// test" >> src/modules/agnes/AgnesPage.tsx

# Stage and commit
git add src/modules/agnes/AgnesPage.tsx
git commit -m "test: Verify git hook"

# Expected: Hook should prompt about updating docs
# Choose 'y' to proceed or 'n' to cancel
```

### Test Documentation Links

```bash
# Check that all docs exist
ls CODE_DOCUMENTATION.md
ls DOCUMENTATION_INDEX.md
ls QUICK_REFERENCE.md
ls src/lib/README.md
ls src/llm-engine/README.md
ls src/core/README.md
ls src/modules/MODULE_README_TEMPLATE.md
```

### Verify Readability

```bash
# Preview markdown in VS Code
code CODE_DOCUMENTATION.md

# Or view in browser (if you have grip or similar)
grip CODE_DOCUMENTATION.md
```

---

## 📖 Usage Examples

### Scenario 1: Adding a New Feature

**Before coding:**
```bash
# Read relevant docs
open src/modules/titan/README.md
open CODE_DOCUMENTATION.md  # Check Feature Addition Checklist
```

**While coding:**
```bash
# Reference patterns
open QUICK_REFERENCE.md  # Encryption, AI, Spine patterns
```

**Before committing:**
```bash
# Update module README
vim src/modules/titan/README.md
# Add your new feature to "Key Features" section

# Commit with docs
git add src/modules/titan/
git commit -m "feat(titan): Add rest day tracking
- Add rest day component
- Update TitanService
- Update titan/README.md"
```

### Scenario 2: Debugging an Issue

```bash
# Check debugging guide
open CODE_DOCUMENTATION.md
# Search for "Debugging Guide" section

# Or use quick reference
open QUICK_REFERENCE.md
# Check "Common Error Solutions" table
```

### Scenario 3: Creating a New Module

```bash
# Copy template
cp src/modules/MODULE_README_TEMPLATE.md src/modules/pulse/README.md

# Customize
vim src/modules/pulse/README.md
# Replace all {Module} with Pulse
# Add actual components, services, etc.

# Update index
vim DOCUMENTATION_INDEX.md
# Add entry to Tier 3 table
```

---

## 🎓 Best Practices

### Documentation Culture

**DO:**
- ✅ Update docs in the same commit as code
- ✅ Use the templates provided
- ✅ Keep read times realistic
- ✅ Add code examples for patterns
- ✅ Cross-reference related docs
- ✅ Fix docs immediately when you spot issues

**DON'T:**
- ❌ Skip docs because "I'll do it later"
- ❌ Create docs outside the repo (no wikis)
- ❌ Leave outdated docs (delete if obsolete)
- ❌ Write docs without code examples
- ❌ Bypass the git hook habitually
- ❌ Copy-paste without customizing

### Writing Style

- **Concise:** Get to the point quickly
- **Actionable:** Include code examples and commands
- **Structured:** Use headings, tables, lists
- **Navigable:** Include cross-references
- **Current:** Update "Last Updated" dates

---

## 🐛 Troubleshooting

### Git Hook Not Running

```bash
# Check if installed
ls -la .git/hooks/pre-commit

# If missing, reinstall
npm run install-doc-hooks

# Check permissions
chmod +x .git/hooks/pre-commit
```

### Hook Blocking Legitimate Commits

```bash
# Bypass hook (use sparingly)
git commit --no-verify -m "message"

# Better: Update the relevant README first
vim src/modules/my-module/README.md
git add src/modules/my-module/README.md
git commit -m "docs: Update module README"
```

### Documentation Out of Date

```bash
# Update immediately
vim RELEVANT_README.md

# Commit just the doc update
git add RELEVANT_README.md
git commit -m "docs: Fix outdated information in X"

# No approval needed for doc-only changes!
```

---

## 📊 Success Metrics

### After Installation

You should be able to:
- [ ] Find any architectural information in < 2 minutes
- [ ] Understand a module's purpose in < 3 minutes
- [ ] Copy a common pattern in < 1 minute
- [ ] Debug common issues using the guides
- [ ] Get automatic documentation reminders on commit

### Long-Term

The system is working if:
- Documentation stays current with code
- New developers onboard in < 30 minutes
- LLM assistants require minimal context
- Fewer "how do I..." questions
- Documentation is seen as helpful, not burdensome

---

## 🔄 Maintenance

### Weekly
- Fix any broken links discovered
- Update read times if inaccurate
- Improve unclear sections

### After Major Changes
- Update architecture diagrams (if added later)
- Revise "Common Patterns" if patterns changed
- Update "File Purposes" if structure changed

### Ongoing
- Create module READMEs as modules are worked on
- Add specialized docs as topics arise
- Improve based on feedback

---

## 📞 Getting Help

### Documentation Questions

**"I can't find information about X"**
→ Check DOCUMENTATION_INDEX.md for navigation

**"This doc is confusing"**
→ Improve it and commit (no approval needed)

**"I need a specialized guide"**
→ Create it in docs/ using existing format

**"The git hook is annoying"**
→ That's the point! Update docs to make it stop 😊

### Contributing Improvements

All developers can improve documentation:
1. Read existing doc
2. Make improvements
3. Commit with clear message
4. No PR review needed for doc-only changes

---

## 🎉 You're All Set!

The documentation system is now installed and ready to use.

**Next steps:**
1. ✅ Install git hooks: `npm run install-doc-hooks`
2. ✅ Read CODE_DOCUMENTATION.md (5 min)
3. ✅ Bookmark QUICK_REFERENCE.md
4. ✅ Make a test commit to see the hook in action

**Remember:** Documentation is a first-class citizen. Treat it like production code.

---

**Questions?** See DOCUMENTATION_INDEX.md or AGENTS.md  
**Installed:** 2026-03-10  
**Ready to code!** 🚀
