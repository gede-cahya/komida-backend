package jwt

import "testing"

func TestCreateAndVerifyRoundTrip(t *testing.T) {
	token, err := Create(Payload{ID: 42, Username: "testuser", Role: "user"})
	if err != nil {
		t.Fatalf("create token: %v", err)
	}
	if token == "" {
		t.Fatal("expected non-empty token")
	}
	payload, err := Verify(token)
	if err != nil {
		t.Fatalf("verify token: %v", err)
	}
	if payload.ID != 42 || payload.Username != "testuser" || payload.Role != "user" {
		t.Fatalf("unexpected payload: %+v", payload)
	}
}

func TestVerifyInvalidToken(t *testing.T) {
	_, err := Verify("invalid.token.here")
	if err == nil {
		t.Fatal("expected error for invalid token")
	}
}
