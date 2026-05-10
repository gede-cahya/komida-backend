package manga

import "encoding/json"

type ListItem struct {
	ID          int      `json:"id"`
	Title       string   `json:"title"`
	Image       string   `json:"image"`
	Rating      *float64 `json:"rating"`
	Chapter     *string  `json:"chapter"`
	Type        *string  `json:"type"`
	Span        *string  `json:"span,omitempty"`
	IsTrending  *bool    `json:"is_trending,omitempty"`
	Link        *string  `json:"link"`
	Source      *string  `json:"source"`
	LastUpdated *string  `json:"last_updated"`
}

type SearchItem struct {
	ID              int             `json:"id"`
	Title           string          `json:"title"`
	Image           string          `json:"image"`
	Rating          *float64        `json:"rating"`
	Chapter         *string         `json:"chapter"`
	PreviousChapter *string         `json:"previous_chapter"`
	Type            *string         `json:"type"`
	Span            *string         `json:"span"`
	IsTrending      *bool           `json:"is_trending"`
	Popularity      *int            `json:"popularity"`
	Link            *string         `json:"link"`
	Source          *string         `json:"source"`
	Chapters        json.RawMessage `json:"chapters"`
	Genres          json.RawMessage `json:"genres"`
	Synopsis        *string         `json:"synopsis"`
	Status          *string         `json:"status"`
	Author          *string         `json:"author"`
	LastUpdated     *string         `json:"last_updated"`
}

type Detail struct {
	Title    string          `json:"title"`
	Image    string          `json:"image"`
	Author   string          `json:"author"`
	Status   string          `json:"status"`
	Genres   json.RawMessage `json:"genres"`
	Synopsis string          `json:"synopsis"`
	Sources  []SourceDetail  `json:"sources"`
}

type SourceDetail struct {
	Name     string          `json:"name"`
	Link     string          `json:"link"`
	Rating   float64         `json:"rating"`
	Chapters json.RawMessage `json:"chapters"`
	Image    string          `json:"image"`
}

type TopManga struct {
	Title  string `json:"title"`
	Image  string `json:"image"`
	Source string `json:"source"`
	Link   string `json:"link,omitempty"`
	Slug   string `json:"slug"`
	Views  int64  `json:"views"`
}
