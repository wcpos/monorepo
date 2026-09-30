import json, sys, datetime

path = sys.argv[1]
text = open(path).read()
docs = []
try:
    raw = json.loads(text)
    docs = list(raw.values()) if isinstance(raw, dict) else raw
except json.JSONDecodeError:
    # Concatenated JSON values with arbitrary separators: walk with raw_decode.
    dec = json.JSONDecoder()
    pos = 0
    n = len(text)
    while pos < n:
        while pos < n and text[pos] not in '{[':
            pos += 1
        if pos >= n:
            break
        try:
            obj, end = dec.raw_decode(text, pos)
            docs.append(obj)
            pos = end
        except json.JSONDecodeError:
            pos += 1
byid = {}
for d in docs:
    if not isinstance(d, dict):
        continue
    doc = d.get('data', d)
    if doc.get('message') == 'JS thread timing report':
        key = doc.get('id') or doc.get('logId') or doc.get('seq') or id(doc)
        byid[key] = doc  # later lines win: the file is append-ordered
rows = list(byid.values())
print(f'{len(docs)} docs in file')

def ts(doc):
    for k in ('timestamp', 'createdAt', 'date_created', 'time'):
        v = doc.get(k)
        if v:
            return v
    return ''

rows.sort(key=ts)
print(f'{len(rows)} timing report rows')
if rows:
    print('keys:', sorted(rows[0].keys()))
for i, doc in enumerate(rows, 1):
    ctx = doc.get('context') or {}
    if isinstance(ctx, str):
        try:
            ctx = json.loads(ctx)
        except Exception:
            pass
    lag = ctx.get('lag', {}) if isinstance(ctx, dict) else {}
    storage = ctx.get('storage', []) if isinstance(ctx, dict) else []
    print(f'\n=== row {i}  ts={ts(doc)}  periodMs={ctx.get("periodMs") if isinstance(ctx, dict) else "?"}')
    print('lag:', json.dumps(lag))
    for e in storage[:12]:
        slow = e.get('slow', [])
        print(f"  {e.get('layer'):7} {e.get('collectionName'):28} {e.get('method'):18} calls={e.get('calls'):5} total={round(e.get('totalMs',0),1):8} max={round(e.get('maxMs',0),1):7} rows={e.get('rows'):6} slow={[round(s.get('ms'),1) for s in slow]}")
