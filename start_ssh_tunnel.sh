#!/bin/bash
# SSH Reverse Tunnel: VPS:3481 -> Local:3481
# Access backend via http://129.226.222.242:3481

PEM="/home/cahya/Downloads/vpsCahya.pem"
VPS="ubuntu@129.226.222.242"
REMOTE_PORT=3481
LOCAL_PORT=3481

echo "🔌 Setting up SSH reverse tunnel..."
echo "   Remote: $VPS:$REMOTE_PORT -> Local:localhost:$LOCAL_PORT"

# Kill existing tunnel if any
pkill -f "ssh -i $PEM -R $REMOTE_PORT:localhost:$LOCAL_PORT"
sleep 1

# Start persistent reverse tunnel
nohup ssh -i "$PEM" \
  -o StrictHostKeyChecking=no \
  -o UserKnownHostsFile=/dev/null \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -o ExitOnForwardFailure=yes \
  -R "$REMOTE_PORT:localhost:$LOCAL_PORT" \
  "$VPS" -N \
  > /tmp/ssh_tunnel.log 2>&1 &

sleep 3

if pgrep -f "ssh -i $PEM -R $REMOTE_PORT:localhost:$LOCAL_PORT" > /dev/null; then
  echo "✅ SSH tunnel started!"
  echo "   Backend accessible at: http://129.226.222.242:$REMOTE_PORT"
  echo "   Test: curl http://129.226.222.242:$REMOTE_PORT/health"
else
  echo "❌ Failed to start tunnel. Check /tmp/ssh_tunnel.log"
  tail -5 /tmp/ssh_tunnel.log
fi
