// Command fake stands in for yt-dlp.exe in tests. A search term or URL containing "fail"
// fails like yt-dlp does, and one containing "slow" runs until it is killed.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"
)

func main() {
	args := os.Args[1:]
	target := args[len(args)-1]
	if strings.Contains(target, "fail") {
		fmt.Fprintln(os.Stderr, "WARNING: something minor")
		fmt.Fprintln(os.Stderr, "ERROR: [generic] "+target+": Unsupported URL")
		os.Exit(1)
	}
	if strings.Contains(target, "slow") {
		time.Sleep(time.Hour)
	}
	switch {
	case slices.Contains(args, "-x"):
		imp(args, target)
	case strings.Contains(target, "search24:"):
		_, term, _ := strings.Cut(target, ":")
		for i, title := range []string{term + " (Live)", term + " (Official Audio)", "Something else"} {
			e, _ := json.Marshal(map[string]any{
				"id": fmt.Sprint("v", i), "title": title, "duration": 200.4,
				"channel": "Artist - Topic", "url": "https://www.youtube.com/watch?v=v" + fmt.Sprint(i),
				"thumbnails": []map[string]any{{"url": "small", "width": 100}, {"url": "big", "width": 300}},
			})
			fmt.Println("VEX>S " + string(e))
		}
	default:
		os.Exit(2)
	}
}

func imp(args []string, url string) {
	out := args[slices.Index(args, "-o")+1]
	path := strings.Replace(out, "%(ext)s", "mp3", 1)
	fmt.Println("VEX>T Imported Title")
	fmt.Println("VEX>A Imported Artist - Topic")
	fmt.Println("VEX>U NA")
	fmt.Println("VEX>D 1000 4000 NA")
	time.Sleep(200 * time.Millisecond)
	fmt.Println("VEX>D 4000 4000 NA")
	fmt.Println("VEX>P")
	if err := os.WriteFile(path, []byte("ID3 fake audio from "+url), 0o644); err != nil {
		fmt.Fprintln(os.Stderr, "ERROR: "+err.Error())
		os.Exit(1)
	}
	os.WriteFile(filepath.Join(filepath.Dir(path), "args.txt"), []byte(strings.Join(args, "\n")), 0o644)
}
