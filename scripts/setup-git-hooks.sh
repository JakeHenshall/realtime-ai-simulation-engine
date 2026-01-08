#!/bin/sh
# Setup script to install git hooks

if [ -d ".git" ]; then
    if [ -f ".githooks/commit-msg" ]; then
        cp .githooks/commit-msg .git/hooks/commit-msg
        chmod +x .git/hooks/commit-msg
        echo "✓ Git hooks installed successfully"
    else
        echo "✗ No hooks found in .githooks/"
        exit 1
    fi
else
    echo "✗ Not a git repository"
    exit 1
fi

