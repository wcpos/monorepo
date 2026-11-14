// Classic-worker console bridge. The shipped engine is fetched and executed VERBATIM.
for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
  const original = console[level];
  console[level] = (...args) => {
    self.postMessage({ spikeConsole: { level, text: args.map(x => x?.message ?? String(x)).join(' ') } });
    original(...args);
  };
}
importScripts('/opfs.worker.js');
