import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/Users/kilbot/Projects/monorepo-v2/.claude/worktrees/ios-device-profile/package.json');
const WebSocket = require('ws');
const METRO = 'http://127.0.0.1:8081';
const out = process.argv[2] || 'heap.heapsnapshot';
const targets = await (await fetch(`${METRO}/json`)).json();
const target = targets.find((t) => /com\.wcpos\.main\.dev/.test(t.title || '')) || targets[0];
const ws = new WebSocket(target.webSocketDebuggerUrl, { headers: { Origin: METRO, 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0' }, maxPayload: 1024 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
const fd = fs.openSync(out, 'w'); let bytes = 0; let done;
const finished = new Promise((r) => (done = r));
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.method === 'HeapProfiler.addHeapSnapshotChunk') { fs.writeSync(fd, m.params.chunk); bytes += m.params.chunk.length; if (bytes % (50 * 1024 * 1024) < m.params.chunk.length) console.error(`${(bytes / 1048576).toFixed(0)} MB`); }
  if (m.id === 1) { console.error('snapshot response', JSON.stringify(m.result ?? m.error)); done(); }
});
ws.on('close', (c) => { console.error('ws closed', c); done(); });
console.error('requesting snapshot', new Date().toISOString());
ws.send(JSON.stringify({ id: 1, method: 'HeapProfiler.takeHeapSnapshot', params: { reportProgress: false } }));
await finished;
fs.closeSync(fd); console.error('wrote', out, (bytes / 1048576).toFixed(1), 'MB', new Date().toISOString()); ws.close(); process.exit(0);
