package manga

import "testing"

func TestEncryptChapterIDMatchesTypeScriptSecureFormat(t *testing.T) {
	got := encryptChapterID("Kiryuu", "https://example.com/chapter/1")
	want := "EE0eBhETThMTUU0mABYYWAMTR00BAAoKD0wTAxsZGRdbAllUEw4AGQgEAxVeBkAOAQURWRNDRF5PFA"
	if got != want {
		t.Fatalf("encryptChapterID() = %q, want %q", got, want)
	}
}
