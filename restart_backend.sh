#!/bin/bash
echo "Restarting Backend on Port 3001..."

# Kill existing process on 3001
PID=$(lsof -t -i:3001)
if [ -n "$PID" ]; then
    echo "Killing PID $PID on port 3001"
    kill -9 $PID
else
    echo "No process found on port 3001"
fi

# Start Backend
echo "Starting backend..."
PORT=3001 bun run src/index.ts > backend.log 2>&1 &
echo "Backend started in background. Log: backend.log"
