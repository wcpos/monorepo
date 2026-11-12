// Capture a Hermes sampling CPU profile through Metro's inspector proxy and write a symbolicated report.
// usage: node cdp-profile.mjs <seconds> <outPrefix>
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const WebSocket = require('ws');
const METRO = process.env.WCPOS_METRO_URL || 'http://127.0.0.1:8081';
const reportOnly = process.argv[2] === 'report';
const seconds = Number(process.argv[2] || 60);
const out = process.argv[3] || 'profile';
let events = [];
if (!reportOnly) {

const targets = await (await fetch(`${METRO}/json`)).json();
const target = targets.find((t) => t.appId === 'com.wcpos.main.dev');
if (!target) throw new Error('no inspector target for com.wcpos.main.dev');
console.error('target', target.title, target.webSocketDebuggerUrl);
const ws = new WebSocket(target.webSocketDebuggerUrl, {
  headers: { Origin: METRO, 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0' },
});
let id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const msgId = ++id;
    pending.set(msgId, { res, rej });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
let complete;
const done = new Promise((r) => (complete = r));
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
    return;
  }
  if (m.method === 'Tracing.dataCollected') events.push(...(m.params.value || []));
  if (m.method === 'Tracing.tracingComplete') complete();
});
ws.on('error', (e) => { console.error('ws error', e.message); process.exit(2); });
ws.on('close', (c) => console.error('ws closed', c));
await new Promise((r) => ws.on('open', r));
await send('Tracing.start', { categories: 'disabled-by-default-v8.cpu_profiler', options: 'sampling-frequency=1000' });
console.error(`recording ${seconds}s…`);
await new Promise((r) => setTimeout(r, seconds * 1000));
await send('Tracing.end');
await done;
ws.close();
fs.writeFileSync(`${out}.trace.json`, JSON.stringify(events));
} else { events = JSON.parse(fs.readFileSync(`${out}.trace.json`, 'utf8')); }

// ---- aggregate
const key = (n) => `${n.callFrame.functionName || '(anon)'} ${/bundle/.test(n.callFrame.url || "") ? "bundle" : ((n.callFrame.url || "").split("/").pop() || "native")}:${n.callFrame.lineNumber + 1}:${n.callFrame.columnNumber + 1}`;
const nodes = new Map();
let samples = [], deltas = [];
for (const ev of events) {
  const cp = ev.args?.data?.cpuProfile;
  if (!cp) continue;
  for (const n of cp.nodes || []) nodes.set(n.id, { ...n });
  if (cp.samples) samples.push(...cp.samples);
  if (ev.args?.data?.timeDeltas) deltas.push(...ev.args.data.timeDeltas);
}
for (const n of nodes.values()) for (const c of n.children || []) { const cn = nodes.get(c); if (cn) cn.parent = n.id; }
let wall = 0;
const bySelf = new Map(), byTotal = new Map();
samples.forEach((sid, i) => {
  const dt = (deltas[i] ?? 1000) / 1000; // ms
  wall += dt;
  let n = nodes.get(sid);
  if (!n) return;
  const selfKey = key(n);
  bySelf.set(selfKey, (bySelf.get(selfKey) || 0) + dt);
  const seenNodes = new Set(), seenFrames = new Set();
  while (n && !seenNodes.has(n.id)) {
    seenNodes.add(n.id);
    const frameKey = key(n);
    if (!seenFrames.has(frameKey)) byTotal.set(frameKey, (byTotal.get(frameKey) || 0) + dt);
    seenFrames.add(frameKey);
    n = nodes.get(n.parent);
  }
});
// symbolicate top frames
const top = [...bySelf.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
const topTotal = [...byTotal.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
const frameOf = (k) => { const m = k.match(/ (\S+):(\d+):(\d+)$/); return m ? { file: m[1], lineNumber: +m[2], column: +m[3] } : null; };
const wanted = [...new Set([...top, ...topTotal].map(([k]) => k))].map((k) => ({ k, f: frameOf(k) })).filter((x) => x.f && x.f.file === 'bundle');
const bundleUrl = [...nodes.values()].map((n) => n.callFrame.url || "").find((u) => /entry\.bundle|\.bundle/.test(u)) || '';
let symbols = new Map();
try {
  const stack = wanted.map((w) => ({ file: bundleUrl, lineNumber: w.f.lineNumber, column: w.f.column, methodName: w.k }));
  const r = await (await fetch(`${METRO}/symbolicate`, { method: 'POST', body: JSON.stringify({ stack }) })).json();
  (r.stack || []).forEach((s, i) => symbols.set(wanted[i].k, `${s.methodName || '?'} ${(s.file || '').replace(`${process.cwd()}/`, '')}:${s.lineNumber}`));
} catch (e) { console.error('symbolicate failed', e.message); }
const fmt = (k, ms) => `${ms.toFixed(0).padStart(7)} ms ${(100 * ms / wall).toFixed(1).padStart(5)}%  ${k}${symbols.has(k) ? `  →  ${symbols.get(k)}` : ''}`;
let report = `samples=${samples.length} wall=${wall.toFixed(0)} ms bundle=${bundleUrl}\n\n== self time ==\n`;
report += top.map(([k, ms]) => fmt(k, ms)).join('\n');
report += `\n\n== total (inclusive) time ==\n` + topTotal.map(([k, ms]) => fmt(k, ms)).join('\n') + '\n';
fs.writeFileSync(`${out}.report.txt`, report);
console.log(report.split('\n').slice(0, 30).join('\n'));
