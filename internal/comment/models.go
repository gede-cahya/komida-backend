package comment

import "time"

type Comment struct {
	ID            int       `json:"id"`
	UserID        int       `json:"user_id"`
	Slug          string    `json:"slug"`
	ChapterSlug   *string   `json:"chapter_slug,omitempty"`
	Content       string    `json:"content"`
	IsSpoiler     bool      `json:"is_spoiler"`
	MediaURL      *string   `json:"media_url,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
	Username      string    `json:"username"`
	Role          string    `json:"role"`
	DisplayName   *string   `json:"display_name,omitempty"`
	AvatarURL     *string   `json:"avatar_url,omitempty"`
	XP            int       `json:"xp"`
	DecorationURL *string   `json:"decoration_url,omitempty"`
	Badges        []Badge   `json:"badges,omitempty"`
	TierInfo      *TierInfo `json:"tier_info,omitempty"`
}

type Badge struct {
	Name    string `json:"name"`
	IconURL string `json:"icon_url"`
}

type TierInfo struct {
	Tier    int    `json:"tier"`
	Name    string `json:"name"`
	MinXP   int    `json:"min_xp"`
	MaxXP   int    `json:"max_xp"`
	Color   string `json:"color"`
	IconURL string `json:"icon_url"`
}

type CreateInput struct {
	Content     string  `json:"content"`
	ChapterSlug *string `json:"chapter_slug,omitempty"`
	IsSpoiler   bool    `json:"is_spoiler"`
	MediaURL    *string `json:"media_url,omitempty"`
}

type UpdateInput struct {
	Content   string  `json:"content"`
	IsSpoiler bool    `json:"is_spoiler"`
	MediaURL  *string `json:"media_url,omitempty"`
}
