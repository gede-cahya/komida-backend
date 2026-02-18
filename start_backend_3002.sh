#!/bin/bash
# Start Backend on 3002
echo "Starting backend on 3002..."
PORT=3002 bun run src/index.ts > backend_3002.log 2>&1 &
echo "Backend started. Log: backend_3002.log"
