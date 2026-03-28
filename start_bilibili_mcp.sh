#!/usr/bin/env bash
set -euo pipefail
cd /root/.openclaw/workspace/tmp/bilibili-package
. .venv/bin/activate
exec python bilibili-mcp/mcp_server.py
