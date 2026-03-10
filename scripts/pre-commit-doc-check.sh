#!/bin/bash

# Pre-commit hook to remind developers to update documentation
# Installation: Copy to .git/hooks/pre-commit and make executable

echo "🔍 Checking for documentation updates..."

# Get list of changed files
CHANGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)

# Flag to track if documentation reminder is needed
NEEDS_DOC_UPDATE=false
DOC_REMINDERS=()

# Check if any code files were changed
for file in $CHANGED_FILES; do
  case "$file" in
    # New module added
    src/modules/*/*)
      if [[ ! "$CHANGED_FILES" =~ "src/modules/$(basename $(dirname "$file"))/README.md" ]]; then
        MODULE_NAME=$(basename $(dirname "$file"))
        DOC_REMINDERS+=("📝 Module '$MODULE_NAME' was modified. Consider updating src/modules/$MODULE_NAME/README.md")
        NEEDS_DOC_UPDATE=true
      fi
      ;;
    
    # Core components changed
    src/core/components/*)
      if [[ ! "$CHANGED_FILES" =~ "src/core/README.md" ]]; then
        DOC_REMINDERS+=("📝 Core components modified. Consider updating src/core/README.md")
        NEEDS_DOC_UPDATE=true
      fi
      ;;
    
    # Services changed
    src/lib/services/*)
      if [[ ! "$CHANGED_FILES" =~ "src/lib/README.md" ]]; then
        DOC_REMINDERS+=("📝 Services modified. Consider updating src/lib/README.md")
        NEEDS_DOC_UPDATE=true
      fi
      ;;
    
    # LLM engine changed (CRITICAL)
    src/llm-engine/*)
      if [[ ! "$CHANGED_FILES" =~ "src/llm-engine/README.md" ]]; then
        DOC_REMINDERS+=("⚠️  LLM engine modified. Update src/llm-engine/README.md if interface changed")
        NEEDS_DOC_UPDATE=true
      fi
      ;;
    
    # Provider hierarchy changed
    src/App.tsx)
      if [[ ! "$CHANGED_FILES" =~ "CODE_DOCUMENTATION.md" ]] && [[ ! "$CHANGED_FILES" =~ "AGENTS.md" ]]; then
        DOC_REMINDERS+=("📝 App.tsx modified. Check if provider hierarchy or routing changed in CODE_DOCUMENTATION.md")
        NEEDS_DOC_UPDATE=true
      fi
      ;;
    
    # Architecture changed
    AGENTS.md|CODE_DOCUMENTATION.md)
      echo "✅ Architecture documentation being updated"
      ;;
  esac
done

# Display reminders if needed
if [ "$NEEDS_DOC_UPDATE" = true ]; then
  echo ""
  echo "⚠️  Documentation Update Reminders:"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  for reminder in "${DOC_REMINDERS[@]}"; do
    echo "$reminder"
  done
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "💡 Documentation Maintenance Protocol:"
  echo "   - Module changes → Update module/README.md"
  echo "   - New component → Update core/README.md"
  echo "   - New service → Update lib/README.md"
  echo "   - Architecture change → Update AGENTS.md & CODE_DOCUMENTATION.md"
  echo ""
  echo "📖 See CODE_DOCUMENTATION.md § Documentation Maintenance Protocol"
  echo ""
  
  # Ask user if they want to proceed
  read -p "Continue with commit? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Commit cancelled. Update documentation and try again."
    exit 1
  fi
fi

echo "✅ Pre-commit checks passed"
exit 0
