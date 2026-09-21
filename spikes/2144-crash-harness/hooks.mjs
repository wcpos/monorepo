// Physical OPFS boundary instrumentation, shared verbatim with the Node self-test.
export function installHooks(prototype, hold) {
  const originals = {}, paths = new WeakMap();
  const state = { phase: 'idle', armed: null, fired: false, mainWrites: 0, walFlushed: false,
    journalFlushed: false, touched: new Set(), failures: [], trace: [] };
  state.arm = spec => {
    Object.assign(state, { armed: spec, fired: false, mainWrites: 0, walFlushed: false,
      journalFlushed: false, touched: new Set(), failures: [], trace: [] });
  };
  function event(e) {
    const a = state.armed;
    if (!a || e.path !== a.path && e.path !== a.path + '-wal' && e.path !== a.path + '-journal') return;
    const main = e.path === a.path, wal = e.path.endsWith('-wal'), journal = e.path.endsWith('-journal');
    const pageWrite = e.op === 'write' && e.offset >= 4096;
    if (e.edge === 'after') {
      if (pageWrite) state.touched.add(e.path);
      if (e.op === 'flush' && state.touched.has(e.path)) {
        if (wal && state.phase === 'commit') state.walFlushed = true;
        if (journal) state.journalFlushed = true;
      }
      if (pageWrite && main && state.phase === (a.mode === 'WAL' ? 'checkpoint' : 'commit')) state.mainWrites++;
      state.trace.push({ ...e, phase: state.phase, mainWrites: state.mainWrites });
    }
    const eligibleMain = pageWrite && main && state.phase === (a.mode === 'WAL' ? 'checkpoint' : 'commit');
    const hit = {
      'wal-after-page-write': wal && pageWrite && e.edge === 'after',
      'wal-after-commit-flush-before-checkpoint': main && pageWrite && state.walFlushed && state.phase === 'checkpoint' && e.edge === 'before',
      'wal-mid-checkpoint': eligibleMain && state.mainWrites === a.k && e.edge === 'after',
      'journal-after-write': journal && pageWrite && e.edge === 'after',
      'journal-after-flush-before-db-write': main && pageWrite && state.journalFlushed && e.edge === 'before',
      'db-mid-commit': eligibleMain && state.mainWrites === a.k && e.edge === 'after',
      'db-after-write-before-flush': eligibleMain && state.mainWrites === a.last && e.edge === 'after',
      'journal-before-delete': journal && (e.op === 'release' || e.op === 'truncate' && e.offset === 4096) && e.edge === 'before',
    }[a.boundary];
    if (hit && !state.fired) { state.fired = true; hold({ ...e, phase: state.phase, mainWrites: state.mainWrites }); }
  }
  for (const op of ['write', 'flush', 'truncate']) {
    originals[op] = prototype[op];
    prototype[op] = function (...args) {
      const offset = op === 'write' ? args[1]?.at ?? 0 : op === 'truncate' ? args[0] : null;
      const length = op === 'write' ? args[0].byteLength : 0;
      let nextPath;
      if (op === 'write' && offset === 0 && length === 516) {
        const input = args[0], bytes = new Uint8Array(input.buffer ?? input, input.byteOffset ?? 0, 512);
        const end = bytes.indexOf(0); nextPath = new TextDecoder().decode(bytes.subarray(0, end < 0 ? 512 : end));
      }
      const e = { op: nextPath === '' ? 'release' : op, path: paths.get(this) ?? '', offset, length };
      event({ ...e, edge: 'before' });
      let result;
      try { result = originals[op].apply(this, args); }
      catch (error) {
        state.failures.push({ ...e, name: error.name, message: error.message }); throw error;
      }
      if (op === 'write' && result !== length) state.failures.push({ ...e, returned: result, expected: length });
      if (nextPath !== undefined) paths.set(this, nextPath);
      event({ ...e, edge: 'after' });
      return result;
    };
  }
  state.restore = () => { for (const op of Object.keys(originals)) prototype[op] = originals[op]; };
  return state;
}
