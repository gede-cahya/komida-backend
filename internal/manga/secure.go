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

type chapterIDPayload struct {
	Source string `json:"source"`
	Link   string `json:"link"`
}
