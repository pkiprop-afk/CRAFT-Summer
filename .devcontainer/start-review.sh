#!/usr/bin/env bash
# Starts the read-only review server, or does nothing if it is already up.
#
# postAttachCommand runs on every reconnect, so a bare `npm start` would fail
# with EADDRINUSE the second time someone opens the codespace. A reviewer
# should never see that.
set -u

if curl -fsS -o /dev/null --max-time 2 http://localhost:3000/ 2>/dev/null; then
  echo "CRAFT Benchmark is already running on port 3000 (read-only review mode)."
  exit 0
fi

echo "Starting CRAFT Benchmark in read-only review mode on port 3000..."
exec npm start
