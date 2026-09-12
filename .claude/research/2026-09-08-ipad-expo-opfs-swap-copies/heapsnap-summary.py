# Summarise a V8/Hermes .heapsnapshot: self size by node name/type, biggest strings.
import json, sys, collections
p = sys.argv[1]
d = json.load(open(p))
meta = d['snapshot']['meta']; nf = meta['node_fields']; nt = meta['node_types'][0]
nodes = d['nodes']; strings = d['strings']; stride = len(nf)
i_type, i_name, i_size, i_edges = nf.index('type'), nf.index('name'), nf.index('self_size'), nf.index('edge_count')
by_name = collections.Counter(); cnt = collections.Counter(); by_type = collections.Counter(); big_strings = []
total = 0; n = len(nodes) // stride
for k in range(n):
    b = k * stride
    t = nt[nodes[b + i_type]]; name = strings[nodes[b + i_name]]; size = nodes[b + i_size]
    total += size; by_type[t] += size
    key = name if t in ('object', 'closure', 'native', 'array', 'code', 'regexp', 'number') else t
    if t == 'string':
        key = 'string'
        if size > 200_000: big_strings.append((size, name[:90].replace('\n', ' ')))
    by_name[key] += size; cnt[key] += 1
print(f'nodes={n:,} total self size={total/1048576:.1f} MB')
print('\n== by type =='); [print(f'{s/1048576:8.1f} MB  {t}') for t, s in by_type.most_common(10)]
print('\n== by name (self size) =='); [print(f'{s/1048576:8.1f} MB {cnt[k]:9,d}  {k[:80]}') for k, s in by_name.most_common(30)]
print('\n== biggest strings =='); [print(f'{s/1048576:8.1f} MB  {v}') for s, v in sorted(big_strings, reverse=True)[:12]]
