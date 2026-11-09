package media

import (
	"container/list"
	"sync"
)

type Entry struct {
	Bytes       []byte
	ContentType string
}

// Cache is a byte-bounded LRU (port of TrackCache.ts).
type Cache struct {
	mu    sync.Mutex
	max   int64
	total int64
	order *list.List
	items map[string]*list.Element
}

type item struct {
	id string
	e  Entry
}

func NewCache(max int64) *Cache {
	return &Cache{max: max, order: list.New(), items: map[string]*list.Element{}}
}

func (c *Cache) Fits(n int64) bool { return n <= c.max }

func (c *Cache) Get(id string) (Entry, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	el, ok := c.items[id]
	if !ok {
		return Entry{}, false
	}
	c.order.MoveToBack(el)
	return el.Value.(*item).e, true
}

func (c *Cache) Set(id string, e Entry) {
	n := int64(len(e.Bytes))
	if !c.Fits(n) {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.del(id)
	for c.total+n > c.max {
		front := c.order.Front()
		if front == nil {
			break
		}
		c.del(front.Value.(*item).id)
	}
	c.items[id] = c.order.PushBack(&item{id, e})
	c.total += n
}

func (c *Cache) Delete(id string) { c.mu.Lock(); c.del(id); c.mu.Unlock() }

func (c *Cache) del(id string) {
	if el, ok := c.items[id]; ok {
		c.total -= int64(len(el.Value.(*item).e.Bytes))
		c.order.Remove(el)
		delete(c.items, id)
	}
}

func (c *Cache) Clear() {
	c.mu.Lock()
	c.order.Init()
	clear(c.items)
	c.total = 0
	c.mu.Unlock()
}

func (c *Cache) Len() int { c.mu.Lock(); defer c.mu.Unlock(); return len(c.items) }
