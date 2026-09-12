import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const WebSocket = require('ws');
const METRO = process.env.WCPOS_METRO_URL || 'http://127.0.0.1:8081';
const targets = await (await fetch(`${METRO}/json`)).json();
for (const target of targets) {
  const ws = new WebSocket(target.webSocketDebuggerUrl, { headers: { Origin: METRO, 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0' } });
  await new Promise((r) => ws.on('open', r));
  const call = (id, method, params={}) => new Promise((res) => { const h = (raw) => { const m = JSON.parse(raw); if (m.id === id) { ws.off('message', h); res(m); } }; ws.on('message', h); ws.send(JSON.stringify({ id, method, params })); });
  const heap = await call(1, 'Runtime.getHeapUsage');
  const stats = await call(2, 'Runtime.evaluate', { expression: 'JSON.stringify(typeof HermesInternal!=="undefined" && HermesInternal.getInstrumentedStats ? HermesInternal.getInstrumentedStats() : {})', returnByValue: true });
  console.log(target.title, '| heap', JSON.stringify(heap.result || heap.error));
  try { const s = JSON.parse(stats.result?.result?.value || '{}'); console.log('  stats', JSON.stringify(Object.fromEntries(Object.entries(s).filter(([k]) => /heap|gc|alloc|Heap|GC|Alloc|mallocSize|numGC/i.test(k))))); } catch (e) { console.log('  stats err', e.message, JSON.stringify(stats).slice(0,200)); }
  ws.close();
}
