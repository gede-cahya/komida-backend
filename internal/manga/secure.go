package manga

import (
	"encoding/base64"
	"encoding/json"
)

const secureKey = "komida-v1"

func encryptChapterID(source string, link string) string {
	payload, err := json.Marshal(chapterIDPayload{Source: source, Link: link})
	if err != nil {
		return ""
	}
	key := []byte(secureKey)
	out := make([]byte, len(payload))
	for i := range payload {
		out[i] = payload[i] ^ key[i%len(key)]
	}
	return base64.RawURLEncoding.EncodeToString(out)
}

func decryptChapterID(id string) (*chapterIDPayload, error) {
	key := []byte(secureKey)
	enc, err := base64.RawURLEncoding.DecodeString(id)
	if err != nil {
		return nil, err
	}
	out := make([]byte, len(enc))
	for i := range enc {
		out[i] = enc[i] ^ key[i%len(key)]
	}
	var payload chapterIDPayload
	if err := json.Unmarshal(out, &payload); err != nil {
		return nil, err
	}
	return &payload, nil
}

type chapterIDPayload struct {
	Source string `json:"source"`
	Link   string `json:"link"`
}
