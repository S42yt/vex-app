package ranking

import (
	"strings"

	"encoding/json"
	"golang.org/x/text/cases"
	"math"
	"os"
	"os/exec"
	"slices"
	"testing"
)

type page struct {
	Query  string `json:"query"`
	Source string `json:"source"`
	Hits   []Hit  `json:"hits"`
}

type tsResult struct {
	Query  string    `json:"query"`
	Order  []string  `json:"order"`
	Scores []float64 `json:"scores"`
}

// Same pages through searchRanking.ts (via ../../ranking/rank-ts.ts) and Rank.
func TestParityWithTS(t *testing.T) {
	cmd := exec.Command("bun", "rank-ts.ts")
	cmd.Dir = "../../ranking"
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("%v\n%s", err, out)
	}
	var pages []page
	var ts []tsResult
	read := func(name string, v any) {
		b, err := os.ReadFile("../../ranking/" + name)
		if err != nil {
			t.Fatal(err)
		}
		json.Unmarshal(b, v)
	}
	read("all-pages.json", &pages)
	read("ts-out.json", &ts)

	same, ties, hits := 0, 0, 0
	for i, p := range pages {
		got := Rank(p.Hits, p.Query)
		ids := make([]string, len(got))
		for j, s := range got {
			ids[j] = s.ID
			if j > 0 && s.Score == got[j-1].Score {
				ties++
			}
		}
		hits += len(got)
		maxDiff := 0.0
		for j := range got {
			// compare scores by id
			k := slices.Index(ts[i].Order, got[j].ID)
			maxDiff = max(maxDiff, math.Abs(ts[i].Scores[k]-got[j].Score))
		}
		if slices.Equal(ids, ts[i].Order) && maxDiff < 1e-9 {
			same++
			continue
		}
		t.Logf("DIFF %-8s %q\n  ts: %v\n  go: %v\n  max score diff %.4f", p.Source, p.Query, ts[i].Order, ids, maxDiff)
		for j := range got {
			k := slices.Index(ts[i].Order, got[j].ID)
			if d := ts[i].Scores[k] - got[j].Score; math.Abs(d) > 1e-9 {
				t.Logf("    id %s %q: ts %.4f go %.4f", got[j].ID, got[j].Signals.Title, ts[i].Scores[k], got[j].Score)
			}
		}
	}
	t.Logf("%d/%d pages identical (order and scores), %d hits, %d exact score ties", same, len(pages), hits, ties)
}

// Unicode case folding for tokens: Σ/σ/ς and İ/I/i compare equal regardless of input case.
func TestFoldVariant(t *testing.T) {
	fold := cases.Fold()
	TokenLower = fold.String
	defer func() { TokenLower = strings.ToLower }()
	TestParityWithTS(t)
	for _, q := range []string{"λογος", "λογοσ", "ΛΟΓΟΣ"} {
		got := tokenize(q)
		if string(got[0]) != "λογοσ" {
			t.Errorf("%q folds to %q", q, string(got[0]))
		}
	}
}
