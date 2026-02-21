#!/bin/bash
# Start Cloudflare Tunnel for komida-api
# Routes api.komida.site → localhost:3002

TUNNEL_NAME="komida-api"
LOG_FILE="/tmp/cloudflared.log"

# Check if cloudflared is already running for this tunnel
if pgrep -f "cloudflared tunnel run $TUNNEL_NAME" > /dev/null; then
    echo "⚡ Tunnel '$TUNNEL_NAME' is already running!"
    echo "   PID: $(pgrep -f "cloudflared tunnel run $TUNNEL_NAME")"
    exit 0
fi

echo "🚀 Starting Cloudflare Tunnel: $TUNNEL_NAME"
echo "   Route: api.komida.site → http://localhost:3002"
echo "   Log:   $LOG_FILE"

nohup cloudflared tunnel run "$TUNNEL_NAME" > "$LOG_FILE" 2>&1 &

sleep 3

if pgrep -f "cloudflared tunnel run $TUNNEL_NAME" > /dev/null; then
    echo "✅ Tunnel started successfully! PID: $(pgrep -f "cloudflared tunnel run $TUNNEL_NAME")"
    echo ""
    echo "   To check status: curl -s https://api.komida.site/api/popular | head -c 100"
    echo "   To stop:         pkill -f 'cloudflared tunnel run $TUNNEL_NAME'"
else
    echo "❌ Failed to start tunnel. Check logs: $LOG_FILE"
    tail -5 "$LOG_FILE"
    exit 1
fi
