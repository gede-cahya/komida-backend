#!/bin/bash

# Login and get token
echo "=== Login ==="
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3481/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "adminc", "password": "azsxdc147258"}')

echo $LOGIN_RESPONSE | jq .

TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.token')
echo -e "\nToken received"

# Test shop items
echo -e "\n=== Shop Items ==="
curl -s http://localhost:3481/api/shop/items | jq '.items | length'

# Test user credits
echo -e "\n=== User Credits ==="
curl -s http://localhost:3481/api/user/credits \
  -H "Authorization: Bearer $TOKEN" | jq .

# Test QRIS payment
echo -e "\n=== QRIS Payment Init ==="
curl -s -X POST http://localhost:3481/api/payment/qris \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount": 15000, "credit_amount": 100}' | jq .

# Test crypto payment
echo -e "\n=== Crypto Payment Init ==="
curl -s -X POST http://localhost:3481/api/payment/crypto \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount_wei": "100000000000000", "credit_amount": 100}' | jq .

echo -e "\n=== All tests completed ==="
