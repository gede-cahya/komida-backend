#!/bin/bash
# Start Backend on 3481
echo "Starting backend on 3481..."
PORT=3481 bun run src/index.ts > backend_3481.log 2>&1 &
echo "Backend started. Log: backend_3481.log"
