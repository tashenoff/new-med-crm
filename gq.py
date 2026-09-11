"""Query graphify graph.json from CLI (no MCP needed).

Usage:
  python gq.py stats
  python gq.py search <query>            # fuzzy node name search
  python gq.py node <id>                 # node details
  python gq.py neighbors <id> [depth]    # neighbors (depth default 1)
  python gq.py path <id1> <id2>          # shortest path
  python gq.py community <id>            # community around node
  python gq.py gods                      # hub nodes
"""
import json, sys, re, difflib

G = json.load(open(r"E:\new-med-crm\graphify-out\graph.json", encoding="utf-8"))
nodes = {n["id"]: n for n in G["nodes"]}
links = G["links"]

def search(q, top=20):
    q = q.lower()
    scored = []
    for nid in nodes:
        l = nid.lower()
        s = 0
        if q in l: s = 100 - l.index(q)
        else:
            m = difflib.SequenceMatcher(None, q, l).ratio()
            s = m * 80
        if s > 30: scored.append((s, nid))
    scored.sort(reverse=True)
    return [n for _, n in scored[:top]]

def nid_of(key):
    if key in nodes: return key
    r = search(key, 1)
    return r[0] if r else None

def show_nodes(ids):
    for i in ids:
        n = nodes.get(i)
        if not n: print("  ?", i); continue
        t = n.get("type", n.get("kind", "?"))
        s = n.get("summary") or n.get("label") or ""
        print(f"  [{t}] {i}  :: {str(s)[:140]}")

cmd = sys.argv[1] if len(sys.argv) > 1 else "stats"

if cmd == "stats":
    print("nodes:", len(nodes), "links:", len(links))
    print("graph attrs:", G.get("graph"))
elif cmd == "search":
    show_nodes(search(" ".join(sys.argv[2:])))
elif cmd == "node":
    i = nid_of(sys.argv[2]); print("id:", i)
    print(json.dumps(nodes.get(i, {}), ensure_ascii=False, indent=1)[:2000])
elif cmd == "neighbors":
    i = nid_of(sys.argv[2]); d = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    adj = {}
    for l in links:
        adj.setdefault(l["source"], []).append(l["target"])
        adj.setdefault(l["target"], []).append(l["source"])
    seen, frontier = {i}, {i}
    for _ in range(d):
        nxt = {t for s in frontier for t in adj.get(s, []) if t not in seen}
        seen |= nxt; frontier = nxt
    print(f"{len(seen)-1} neighbors of {i}:")
    show_nodes(sorted(seen - {i}))
elif cmd == "path":
    import heapq
    s, t = nid_of(sys.argv[2]), nid_of(sys.argv[3])
    adj = {}
    for l in links:
        adj.setdefault(l["source"], []).append(l["target"])
        adj.setdefault(l["target"], []).append(l["source"])
    prev, q, seen = {}, [s], {s}
    while q and t not in seen:
        c = q.pop(0)
        for n in adj.get(c, []):
            if n not in seen: seen.add(n); prev[n] = c; q.append(n)
    if t not in seen: print("no path")
    else:
        p = [t]
        while p[-1] != s: p.append(prev[p[-1]])
        show_nodes(p[::-1])
elif cmd == "community":
    i = nid_of(sys.argv[2])
    n = nodes[i]
    cid = n.get("community") or n.get("cid")
    same = [k for k, v in nodes.items() if (v.get("community") or v.get("cid")) == cid]
    print("community", cid, "-", len(same), "nodes:")
    show_nodes(sorted(same))
elif cmd == "gods":
    from collections import Counter
    c = Counter()
    for l in links:
        c[l["source"]] += 1; c[l["target"]] += 1
    show_nodes([n for n, _ in c.most_common(30)])
