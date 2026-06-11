// Node 22 does not recursively discover tests when passed a directory path.
// This entrypoint keeps `node --test packages/virtual-printer/` working as documented.
await import('./escpos-summary.test.mjs');
await import('./http-router.test.mjs');
await import('./server-config.test.mjs');
await import('./index-start.test.mjs');
await import('./mdns-services.test.mjs');
