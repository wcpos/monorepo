// Stream uncaught exceptions and console.error/warn from the dev client via Metro's inspector, symbolicated.
import { createRequire } from 'node:module';
const require = createRequire(process.env.WCPOS_WORKTREE_PKG || '/Users/kilbot/Projects/monorepo-v2/.claude/worktrees/fix+expo-opfs-swap-copies/package.json');
const WebSocket = require('ws');
const METRO = 'http://127.0.0.1:8081';
const targets = await (await fetch(`${METRO}/json`)).json();
const target = targets.find((t) => /com\.wcpos\.main\.dev/.test(t.title || '')) || targets[0];
if (!target) { console.log('no inspector target'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl, { headers: { Origin: METRO, 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0' } });
let id = 0;
const send = (method, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }));
async function symbolicate(frames) {
  try {
    const stack = frames.slice(0, 8).map((f) => ({ file: f.url, lineNumber: f.lineNumber + 1, column: f.columnNumber + 1, methodName: f.functionName || '?' }));
    const r = await (await fetch(`${METRO}/symbolicate`, { method: 'POST', body: JSON.stringify({ stack }) })).json();
    return (r.stack || []).map((s) => `${s.methodName || '?'} (${(s.file || '').replace(/^.*\/monorepo-v2\/[^/]*\/?/, '')}:${s.lineNumber})`).join(' < ');
  } catch (e) { return `symbolicate failed: ${e.message}`; }
}
ws.on('open', () => { send('Runtime.enable'); console.log(`listening on ${target.title}`); });
ws.on('message', async (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails; const frames = d.stackTrace?.callFrames || [];
    console.log(`EXCEPTION ${new Date().toISOString().slice(11, 19)} ${(d.exception?.description || d.text || '').split('\n')[0].slice(0, 300)} | ${await symbolicate(frames)}`);
  } else if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) {
    const text = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').split('\n')[0].slice(0, 300);
    const frames = m.params.stackTrace?.callFrames || [];
    console.log(`CONSOLE.${m.params.type} ${new Date().toISOString().slice(11, 19)} ${text} | ${await symbolicate(frames)}`);
  }
});
ws.on('close', (c) => { console.log(`inspector closed ${c}`); process.exit(0); });
ws.on('error', (e) => { console.log(`inspector error ${e.message}`); process.exit(1); });
