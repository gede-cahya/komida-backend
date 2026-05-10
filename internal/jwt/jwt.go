package jwt

import (
	"errors"
	"fmt"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

var jwtSecret = func() []byte {
	s := os.Getenv("JWT_SECRET")
	if s == "" {
		s = "komida-secret"
	}
	return []byte(s)
}()

type Payload struct {
	ID       int    `json:"id"`
	Username string `json:"username"`
	Role     string `json:"role"`
}

func Create(payload Payload) (string, error) {
	claims := jwt.MapClaims{
		"id":       payload.ID,
		"username": payload.Username,
		"role":     payload.Role,
		"exp":      time.Now().Add(24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret)
}

func Verify(tokenString string) (*Payload, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return jwtSecret, nil
	})
	if err != nil {
		return nil, err
	}
	if !token.Valid {
		return nil, errors.New("invalid token")
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, errors.New("invalid claims")
	}
	idFloat, _ := claims["id"].(float64)
	username, _ := claims["username"].(string)
	role, _ := claims["role"].(string)
	if idFloat == 0 || username == "" {
		return nil, errors.New("missing token fields")
	}
	return &Payload{
		ID:       int(idFloat),
		Username: username,
		Role:     role,
	}, nil
}
