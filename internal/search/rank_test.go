package search

import (
	"encoding/json"
	"flag"
	"math"
	"os"
	"slices"
	"testing"
)

var update = flag.Bool("update", false, "rewrite testdata/ranked.json from the current ranker")

type page struct {
	Query  string `json:"query"`
	Source string `json:"source"`
	Hits   []Hit  `json:"hits"`
}

type ranked struct {
	Query  string    `json:"query"`
	Order  []string  `json:"order"`
	Scores []float64 `json:"scores"`
}

func TestRankGolden(t *testing.T) {
	raw, err := os.ReadFile("testdata/pages.json")
	if err != nil {
		t.Fatal(err)
	}
	var pages []page
	if err := json.Unmarshal(raw, &pages); err != nil {
		t.Fatal(err)
	}
	got := make([]ranked, len(pages))
	for i, p := range pages {
		got[i].Query = p.Query
		for _, s := range Rank(p.Hits, p.Query) {
			got[i].Order = append(got[i].Order, s.ID)
			got[i].Scores = append(got[i].Scores, s.Score)
		}
	}
	if *update {
		b, _ := json.MarshalIndent(got, "", "\t")
		if err := os.WriteFile("testdata/ranked.json", append(b, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
		return
	}
	raw, err = os.ReadFile("testdata/ranked.json")
	if err != nil {
		t.Fatal(err)
	}
	var want []ranked
	json.Unmarshal(raw, &want)
	if len(want) != len(pages) {
		t.Fatalf("%d golden pages for %d pages", len(want), len(pages))
	}
	for i := range got {
		if !slices.Equal(got[i].Order, want[i].Order) {
			t.Errorf("%q order\n got  %v\n want %v", got[i].Query, got[i].Order, want[i].Order)
			continue
		}
		for j := range got[i].Scores {
			if math.Abs(got[i].Scores[j]-want[i].Scores[j]) > 1e-9 {
				t.Errorf("%q: %s scores %.6f, golden %.6f", got[i].Query, got[i].Order[j], got[i].Scores[j], want[i].Scores[j])
			}
		}
	}
}

func TestFoldedTokens(t *testing.T) {
	for _, q := range []string{"λογος", "λογοσ", "ΛΟΓΟΣ"} {
		if got := string(tokenize(q)[0]); got != "λογοσ" {
			t.Errorf("%q folds to %q", q, got)
		}
	}
}
