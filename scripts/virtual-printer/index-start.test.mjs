import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { once } from 'node:events';

const getAvailablePort = async () => {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  server.close();
  await once(server, 'close');
  return port;
};

test('virtual printer entrypoint starts under ESM', async () => {
  const [rawPort, httpPort] = await Promise.all([getAvailablePort(), getAvailablePort()]);
  const child = spawn(process.execPath, ['scripts/virtual-printer/index.mjs'], {
    env: {
      ...process.env,
      VP_RAW_PORT: String(rawPort),
      VP_HTTP_PORT: String(httpPort),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  let resolveStarted;
  const startedPromise = new Promise((resolve) => {
    resolveStarted = resolve;
  });
  const checkStarted = () => {
    if (output.includes(`HTTP endpoints listening on http://0.0.0.0:${httpPort}`)) {
      resolveStarted(true);
    }
  };
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    output += chunk;
    checkStarted();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });

  const exitPromise = once(child, 'exit');
  let started = false;
  try {
    started = await Promise.race([
      startedPromise,
      exitPromise.then(([code, signal]) => {
        throw new Error(`virtual printer exited before startup (${code ?? signal}):\n${output}`);
      }),
      new Promise((_, reject) => {
        const timeout = setTimeout(
          () => reject(new Error(`timed out waiting for startup:\n${output}`)),
          5000
        );
        timeout.unref();
      }),
    ]);

    assert.equal(started, true);
  } finally {
    if (!started) {
      child.kill('SIGTERM');
      await exitPromise;
    }
  }

  child.kill('SIGTERM');
  const [code, signal] = await exitPromise;
  assert.equal(signal, null, `expected graceful shutdown, got signal ${signal}`);
  assert.equal(code, 0, `expected exit code 0, got ${code}`);
});
