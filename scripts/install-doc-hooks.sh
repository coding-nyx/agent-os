#!/bin/bash

# Script to install documentation maintenance git hooks
# Run: npm run install-doc-hooks

echo "📦 Installing documentation maintenance git hooks..."

# Check if .git directory exists
if [ ! -d ".git" ]; then
  echo "❌ Error: Not a git repository. Run this from the project root."
  exit 1
fi

# Create hooks directory if it doesn't exist
mkdir -p .git/hooks

# Copy pre-commit hook
cp scripts/pre-commit-doc-check.sh .git/hooks/pre-commit

# Make executable
chmod +x .git/hooks/pre-commit

echo "✅ Git hooks installed successfully!"
echo ""
echo "🎯 What this does:"
echo "   - Checks for code changes before each commit"
echo "   - Reminds you to update relevant documentation"
echo "   - Prevents accidental documentation drift"
echo ""
echo "📝 To bypass the hook (use sparingly):"
echo "   git commit --no-verify -m 'message'"
echo ""
echo "🔧 To uninstall:"
echo "   rm .git/hooks/pre-commit"
