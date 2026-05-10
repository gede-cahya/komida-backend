package user

import "time"

type User struct {
	ID            int       `json:"id"`
	Username      string    `json:"username"`
	Password      string    `json:"-"`
	Role          string    `json:"role"`
	Email         *string   `json:"email"`
	DisplayName   *string   `json:"display_name"`
	AvatarURL     *string   `json:"avatar_url"`
	WalletAddress *string   `json:"wallet_address"`
	IsBanned      bool      `json:"is_banned"`
	XP            int       `json:"xp"`
	Tier          int       `json:"tier"`
	CreatedAt     time.Time `json:"created_at"`
}

type Profile struct {
	ID            int       `json:"id"`
	Username      string    `json:"username"`
	Role          string    `json:"role"`
	Email         *string   `json:"email"`
	DisplayName   *string   `json:"display_name"`
	AvatarURL     *string   `json:"avatar_url"`
	WalletAddress *string   `json:"wallet_address"`
	IsBanned      bool      `json:"is_banned"`
	XP            int       `json:"xp"`
	Tier          int       `json:"tier"`
	CreatedAt     time.Time `json:"created_at"`
	DecorationURL *string   `json:"decoration_url,omitempty"`
	Badges        []Badge   `json:"badges,omitempty"`
}

type Badge struct {
	Name    string `json:"name"`
	IconURL string `json:"icon_url"`
}

type RegisterInput struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type LoginInput struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type UpdateProfileInput struct {
	DisplayName *string `json:"display_name,omitempty"`
	Email       *string `json:"email,omitempty"`
	AvatarURL   *string `json:"avatar_url,omitempty"`
}
