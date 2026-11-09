package search

import (
	"math"
	"regexp"
	"slices"
	"strings"
	"unicode"

	"golang.org/x/text/cases"
	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

type Signals struct {
	Title        string `json:"title"`
	Creator      string `json:"creator"`
	DurationSec  *int   `json:"durationSec"`
	TopicChannel bool   `json:"topicChannel"`
	Verified     bool   `json:"verified"`
}

type Hit struct {
	ID      string  `json:"id"`
	Signals Signals `json:"signals"`
}

const (
	relevanceWeight  = 16
	creatorWeight    = 3
	platformWeight   = 5
	platformHalfLife = 8
	minSongSec       = 45
	longSongSec      = 9 * 60
	notASongSec      = 15 * 60
	notATrackPenalty = 5
	notTheTrackPen   = 3
)

type matcher func(string) bool

func re(p string) matcher { return regexp.MustCompile(p).MatchString }

var (
	reMix          = regexp.MustCompile(`\bmix\b`)
	reMixQualifier = regexp.MustCompile(`\b(?:original|extended|club|radio|vip|dub|instrumental|festival)\s$`)
	reMixOther     = regexp.MustCompile(`\b(?:dj[ -]?set|mega ?mix|mixtape)\b`)
)

// JS: \b(?:dj[ -]?set|mega ?mix|mixtape|(?<!\b(?:original|…|festival)\s)mix)\b
func notATrackMix(s string) bool {
	if reMixOther.MatchString(s) {
		return true
	}
	for _, m := range reMix.FindAllStringIndex(s, -1) {
		if !reMixQualifier.MatchString(s[:m[0]]) {
			return true
		}
	}
	return false
}

var notATrack = []matcher{
	notATrackMix,
	re(`\b(?:full album|compilation|playlist|medley|nonstop)\b`),
	re(`\b\d+\s*hours?\b`),
	re(`\b(?:reaction|review|interview|tutorial|podcast|trailer|karaoke|documentary|type beat)\b`),
}

var notTheTrack = []matcher{
	re(`\blive\b`),
	re(`\b(?:behind the scenes|making of|teaser|snippet|preview)\b`),
	re(`\b(?:instrumental|acapella|a cappella)\b`),
	re(`\b(?:sped up|slowed|nightcore|8d audio|bass boosted)\b`),
	re(`\b(?:cover|remake|tribute|parody|remix|flip|mashup|bootleg)\b`),
}

var reOfficial = regexp.MustCompile(`\bofficial\b`)

var stripMarks = runes.Remove(runes.In(unicode.M))

func tokenize(text string) [][]rune {
	s, _, _ := transform.String(transform.Chain(norm.NFD, stripMarks), fold.String(text))
	s = strings.Map(func(r rune) rune {
		switch r {
		case '‘', '’', 'ʼ', '´', '\'', '`':
			return -1
		}
		return r
	}, s)
	fields := strings.FieldsFunc(s, func(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsNumber(r) })
	out := make([][]rune, len(fields))
	for i, f := range fields {
		out[i] = []rune(f)
	}
	return out
}

// Case folding, unlike strings.ToLower, makes Σ, σ and ς the same letter.
var fold = cases.Fold()

func lower(s string) string { return strings.ToLower(s) }

func editBudget(n int) int {
	switch {
	case n <= 3:
		return 0
	case n <= 6:
		return 1
	}
	return 2
}

func withinEditDistance(a, b []rune, max int) bool {
	if abs(len(a)-len(b)) > max {
		return false
	}
	prev := make([]int, len(b)+1)
	for i := range prev {
		prev[i] = i
	}
	row := make([]int, len(b)+1)
	for i := 1; i <= len(a); i++ {
		row[0] = i
		best := i
		for j := 1; j <= len(b); j++ {
			cost := 1
			if a[i-1] == b[j-1] {
				cost = 0
			}
			row[j] = min(prev[j]+1, row[j-1]+1, prev[j-1]+cost)
			best = min(best, row[j])
		}
		if best > max {
			return false
		}
		prev, row = row, prev
	}
	return prev[len(b)] <= max
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

func hasPrefix(s, p []rune) bool { return len(s) >= len(p) && slices.Equal(s[:len(p)], p) }

func tokenMatch(q, t []rune) float64 {
	switch {
	case slices.Equal(q, t):
		return 1
	case len(q) >= 4 && hasPrefix(t, q):
		return 0.9
	case len(t) >= 4 && hasPrefix(q, t):
		return 0.85
	}
	if b := editBudget(len(q)); b > 0 && withinEditDistance(q, t, b) {
		return 0.8
	}
	return 0
}

func bestMatch(q []rune, tokens [][]rune) float64 {
	best := 0.0
	for _, t := range tokens {
		best = max(best, tokenMatch(q, t))
		if best == 1 {
			break
		}
	}
	return best
}

func lift(ms []matcher, lowerQuery string) []matcher {
	var out []matcher
	for _, m := range ms {
		if !m(lowerQuery) {
			out = append(out, m)
		}
	}
	return out
}

type Scored struct {
	Hit
	Score float64
}

func Rank(hits []Hit, query string) []Scored {
	out := make([]Scored, len(hits))
	for i, h := range hits {
		out[i].Hit = h
	}
	if len(hits) < 2 {
		return out
	}
	var queryTokens [][]rune
	for _, t := range tokenize(query) {
		if !slices.ContainsFunc(queryTokens, func(q []rune) bool { return slices.Equal(q, t) }) {
			queryTokens = append(queryTokens, t)
		}
	}
	lowerQuery := lower(query)
	nat, ntt := lift(notATrack, lowerQuery), lift(notTheTrack, lowerQuery)
	wantsLong := len(nat) < len(notATrack)

	type cand struct {
		tokens, creator [][]rune
		lowerTitle      string
		matches         []float64
	}
	cands := make([]cand, len(hits))
	for i, h := range hits {
		c := cand{tokens: tokenize(h.Signals.Title), creator: tokenize(h.Signals.Creator), lowerTitle: lower(h.Signals.Title)}
		for _, q := range queryTokens {
			c.matches = append(c.matches, max(bestMatch(q, c.tokens), bestMatch(q, c.creator)))
		}
		cands[i] = c
	}
	weights := make([]float64, len(queryTokens))
	total := 0.0
	for p := range queryTokens {
		df := 0
		for _, c := range cands {
			if c.matches[p] > 0 {
				df++
			}
		}
		weights[p] = math.Log(1 + float64(len(hits))/float64(1+df))
		total += weights[p]
	}
	if total == 0 {
		total = 1
	}
	for i, c := range cands {
		answered := 0.0
		for p, m := range c.matches {
			answered += m * weights[p]
		}
		named := 0.0
		for _, t := range c.creator {
			named += bestMatch(t, queryTokens)
		}
		creator := 0.0
		if len(c.creator) > 0 {
			creator = named / float64(len(c.creator))
		}
		prior := platformWeight * (platformHalfLife / (platformHalfLife + float64(i)))
		out[i].Score = relevanceWeight*(answered/total) + creatorWeight*creator + affinity(hits[i].Signals, c.lowerTitle, nat, ntt, wantsLong) + prior
	}
	slices.SortStableFunc(out, func(a, b Scored) int {
		switch {
		case a.Score > b.Score:
			return -1
		case a.Score < b.Score:
			return 1
		}
		return 0
	})
	return out
}

func affinity(s Signals, lowerTitle string, nat, ntt []matcher, wantsLong bool) float64 {
	score := 0.0
	if s.TopicChannel {
		score += 3
	}
	if reOfficial.MatchString(lowerTitle) {
		score += 2
	}
	if s.Verified {
		score++
	}
	switch d := s.DurationSec; {
	case d == nil:
		score -= 4
	case *d < minSongSec:
		score -= 3
	case *d <= longSongSec:
		score += 2
	case *d > notASongSec && !wantsLong:
		score -= 3
	}
	for _, m := range nat {
		if m(lowerTitle) {
			score -= notATrackPenalty
		}
	}
	for _, m := range ntt {
		if m(lowerTitle) {
			score -= notTheTrackPen
		}
	}
	return score
}
