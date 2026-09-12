import xml.etree.ElementTree as ET, sys, collections
tree = ET.parse(sys.argv[1]); root = tree.getroot()
cache = {}
def text(el):
    if el is None: return ''
    if 'ref' in el.attrib: return cache.get(el.attrib['ref'], '')
    t = (el.attrib.get('fmt') or el.text or '').strip()
    if 'id' in el.attrib: cache[el.attrib['id']] = t
    return t
def resolve(el):
    # store the whole element for backtraces so refs can be followed
    if el is None: return None
    if 'ref' in el.attrib: return cache.get('el:'+el.attrib['ref'])
    if 'id' in el.attrib: cache['el:'+el.attrib['id']] = el
    return el
by_thread = collections.Counter(); top_by_thread = collections.defaultdict(collections.Counter); n=0
for row in root.iter('row'):
    th = ''; bt = None
    for child in row:
        if child.tag == 'thread': th = text(child)
        elif child.tag == 'backtrace': bt = resolve(child)
        elif 'id' in child.attrib: text(child)
    if not th: continue
    n += 1; by_thread[th] += 1
    if bt is not None:
        frames = list(bt.iter('frame'))
        if frames:
            f0 = frames[0]
            name = f0.attrib.get('name') or text(f0)
            if 'ref' in f0.attrib: name = cache.get('fr:'+f0.attrib['ref'], name)
            if 'id' in f0.attrib: cache['fr:'+f0.attrib['id']] = f0.attrib.get('name','')
            top_by_thread[th][name] += 1
print(f'samples={n}')
for th, c in by_thread.most_common(8):
    print(f'\n== {c:6d} {100*c/n:5.1f}%  {th}')
    for name, k in top_by_thread[th].most_common(10):
        print(f'     {k:6d}  {name[:110]}')
