#!/bin/bash
# Execute this script to clean up the Nexus codebase
# Run from project root: bash EXECUTE_CLEANUP.sh

echo "🧹 Nexus Codebase Cleanup"
echo "=========================="
echo ""
echo "This will remove 28 files + 1 directory"
echo ""
read -p "Press ENTER to continue or Ctrl+C to cancel..."
echo ""

# Remove redundant documentation (14 files)
echo "📄 Removing redundant documentation..."
rm -f GEMINI.md
rm -f THOUGHT_TAG_ANALYSIS.md
rm -f THOUGHT_TAG_QUICK_REF.md
rm -f CLEANUP_ANALYSIS_REPORT.md
rm -f docs/ANALYSIS_SUMMARY.md
rm -f docs/ANTI_PATTERN_SCAN.md
rm -f docs/ARCHITECTURAL_CONFORMANCE_REPORT.md
rm -f docs/CONFORMANCE_ANALYSIS.md
rm -f docs/MASTER_CONFORMANCE_REPORT.md
rm -f docs/PROFILE_STORE_ALIGNMENT.md
rm -f docs/VAULT_GATING.md
rm -f docs/VAULT_SHELL_ASSESSMENT.md
rm -f docs/agnes-session-lifecycle-analysis.md
rm -f docs/LLM_AI_DESIGN_ANALYSIS.md
rm -f docs/LLM_AI_QUICK_REFERENCE.md
echo "  ✅ Removed 14 documentation files"

# Remove orphaned test files (5 files)
echo "🧪 Removing orphaned test files..."
rm -f test_api.js
rm -f test_hub.ts
rm -f test_llm.ts
rm -f test_orchestrator.ts
rm -f test_stream.js
echo "  ✅ Removed 5 test files"

# Remove verification/patch scripts (5 files)
echo "🔧 Removing one-time scripts..."
rm -f verify_logic.js
rm -f verify_logic_v2.js
rm -f verify_stream.js
rm -f patch_atlas.js
rm -f patch_atlas_profile.js
echo "  ✅ Removed 5 script files"

# Remove miscellaneous files (3 files)
echo "🗑️  Removing miscellaneous files..."
rm -f unnamed.jpg
rm -f pnpm-lock.yaml
rm -f todos.db
echo "  ✅ Removed 3 misc files"

# Remove empty directory
echo "📁 Removing empty directories..."
if [ -d "plans" ] && [ -z "$(ls -A plans 2>/dev/null)" ]; then
  rmdir plans
  echo "  ✅ Removed plans/"
else
  echo "  ⚠️  plans/ not empty or doesn't exist"
fi

# Remove cleanup summary
rm -f CLEANUP_SUMMARY.md
echo "  ✅ Removed CLEANUP_SUMMARY.md"

# Self-destruct
rm -f EXECUTE_CLEANUP.sh
echo "  ✅ Removed this script"

echo ""
echo "✨ Cleanup complete!"
echo ""
echo "📋 Next steps:"
echo "  1. Verify: npm run build"
echo "  2. Test: npm run dev"
echo "  3. Commit: git add -A && git commit -m 'chore: Clean up codebase'"
echo ""
