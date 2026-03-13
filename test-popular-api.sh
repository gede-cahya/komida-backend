#!/bin/bash

# Login dan dapat token
echo "=== Login Admin ==="
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3481/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "adminc", "password": "azsxdc147258"}')

echo $LOGIN_RESPONSE | jq .

TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.token')
echo -e "\n=== Test Popular API (Day) ==="
curl -s "http://localhost:3481/api/admin/stats/popular?period=day" \
  -H "Authorization: Bearer $TOKEN" | jq '.'

echo -e "\n=== Test Popular API (Week) ==="
curl -s "http://localhost:3481/api/admin/stats/popular?period=week" \
  -H "Authorization: Bearer $TOKEN" | jq '.'
