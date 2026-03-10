#!/bin/bash

# Nexus Codebase Cleanup Script
# Generated: 2026-03-10
# Execute from project root

echo "🧹 Starting Nexus codebase cleanup..."
echo ""

# Count files before cleanup
TOTAL_REMOVED=0

# Phase 1: Redundant/Outdated Documentation (13 files)
echo "📄 Phase 1: Removing redundant documentation..."

FILES_TO_DELETE=(
  "GEMINI.md"
  "THOUGHT_TAG_ANALYSIS.md"
  "THOUGHT_TAG_QUICK_REF.md"
  "docs/ANALYSIS_SUMMARY.md"
  "docs/ANTI_PATTERN_SCAN.md"
  "docs/ARCHITECTURAL_CONFORMANCE_REPORT.md"
  "docs/CONFORMANCE_ANALYSIS.md"
  "docs/MASTER_CONFORMANCE_REPORT.md"
  "docs/PROFILE_STORE_ALIGNMENT.md"
  "docs/VAULT_GATING.md"
  "docs/VAULT_SHELL_ASSESSMENT.md"
  "docs/agnes-session-lifecycle-analysis.md"
  "docs/LLM_AI_DESIGN_ANALYSIS.md"
  "docs/LLM_AI_QUICK_REFERENCE.md"
)

for file in "${FILES_TO_DELETE[@]}"; do
  if [ -f "$file" ]; then
    rm "$file"
    echo "  ✅ Deleted: $file"
    ((TOTAL_REMOVED++))
  else
    echo "  ⚠️  Not found: $file"
  fi
done

# Phase 2: Orphaned Test Files (5 files)
echo ""
echo "🧪 Phase 2: Removing orphaned test files..."

TEST_FILES=(
  "test_api.js"
  "test_hub.ts"
  "test_llm.ts"
  "test_orchestrator.ts"
  "test_stream.js"
)

for file in "${TEST_FILES[@]}"; do
  if [ -f "$file" ]; then
    rm "$file"
    echo "  ✅ Deleted: $file"
    ((TOTAL_REMOVED++))
  else
    echo "  ⚠️  Not found: $file"
  fi
done

# Phase 3: Verification/Patch Scripts (5 files)
echo ""
echo "🔧 Phase 3: Removing one-time scripts..."

SCRIPT_FILES=(
  "verify_logic.js"
  "verify_logic_v2.js"
  "verify_stream.js"
  "patch_atlas.js"
  "patch_atlas_profile.js"
)

for file in "${SCRIPT_FILES[@]}"; do
  if [ -f "$file" ]; then
    rm "$file"
    echo "  ✅ Deleted: $file"
    ((TOTAL_REMOVED++))
  else
    echo "  ⚠️  Not found: $file"
  fi
done

# Phase 4: Miscellaneous Files (4 files)
echo ""
echo "🗑️  Phase 4: Removing miscellaneous files..."

MISC_FILES=(
  "unnamed.jpg"
  "pnpm-lock.yaml"
  "todos.db"
)

for file in "${MISC_FILES[@]}"; do
  if [ -f "$file" ]; then
    rm "$file"
    echo "  ✅ Deleted: $file"
    ((TOTAL_REMOVED++))
  else
    echo "  ⚠️  Not found: $file"
  fi
done

# Phase 5: Empty Directories
echo ""
echo "📁 Phase 5: Removing empty directories..."

if [ -d "plans" ]; then
  if [ -z "$(ls -A plans)" ]; then
    rmdir "plans"
    echo "  ✅ Deleted: plans/ (empty directory)"
    ((TOTAL_REMOVED++))
  else
    echo "  ⚠️  plans/ is not empty, skipping"
  fi
else
  echo "  ⚠️  Not found: plans/"
fi

# Phase 6: Cleanup analysis report itself
echo ""
echo "📋 Phase 6: Removing cleanup analysis report..."

if [ -f "CLEANUP_ANALYSIS_REPORT.md" ]; then
  rm "CLEANUP_ANALYSIS_REPORT.md"
  echo "  ✅ Deleted: CLEANUP_ANALYSIS_REPORT.md"
  ((TOTAL_REMOVED++))
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ Cleanup complete!"
echo "📊 Total files removed: $TOTAL_REMOVED"
echo ""
echo "🔍 Next steps:"
echo "   1. Run: npm run build"
echo "   2. Verify: npm run dev"
echo "   3. Commit: git add -A && git commit -m 'chore: Clean up codebase'"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
