import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';

const requestOptions = (port, path) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: 'OPTIONS',
        headers: {
          Origin: 'https://pos.example.test',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type',
          'Access-Control-Request-Private-Network': 'true',
        },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res));
      }
    );
    req.on('error', reject);
    req.end();
  });

const getAvailablePort = async () => {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  server.close();
  await once(server, 'close');
  return port;
};

const startVirtualPrinter = async (env, expectedOutput) => {
  const child = spawn(process.execPath, ['index.mjs'], {
    env: {
      ...process.env,
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  let resolveStarted;
  const startedPromise = new Promise((resolve) => {
    resolveStarted = resolve;
  });
  const checkStarted = () => {
    if (output.includes(expectedOutput)) {
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
};

test('virtual printer entrypoint starts under ESM', async () => {
  const [rawPort, httpPort] = await Promise.all([getAvailablePort(), getAvailablePort()]);

  await startVirtualPrinter(
    {
      VP_RAW_PORT: String(rawPort),
      VP_HTTP_PORT: String(httpPort),
    },
    `both HTTP endpoints listening on http://0.0.0.0:${httpPort}`
  );
});

test('virtual printer entrypoint starts in Star WebPRNT mode', async () => {
  const [rawPort, httpPort] = await Promise.all([getAvailablePort(), getAvailablePort()]);

  await startVirtualPrinter(
    {
      VP_VENDOR: 'star',
      VP_RAW_PORT: String(rawPort),
      VP_HTTP_PORT: String(httpPort),
    },
    `star HTTP endpoints listening on http://0.0.0.0:${httpPort}`
  );
});

test('allows private-network CORS preflight requests', async () => {
  const [rawPort, httpPort] = await Promise.all([getAvailablePort(), getAvailablePort()]);
  const child = spawn(process.execPath, ['index.mjs'], {
    env: {
      ...process.env,
      VP_VENDOR: 'star',
      VP_RAW_PORT: String(rawPort),
      VP_HTTP_PORT: String(httpPort),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  const exitPromise = once(child, 'exit');
  try {
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });

    await Promise.race([
      new Promise((resolve) => {
        child.stdout.on('data', () => {
          if (output.includes(`star HTTP endpoints listening on http://0.0.0.0:${httpPort}`)) {
            resolve();
          }
        });
      }),
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

    const response = await requestOptions(httpPort, '/StarWebPRNT/SendMessage');
    assert.equal(response.statusCode, 204);
    assert.equal(response.headers['access-control-allow-private-network'], 'true');
  } finally {
    child.kill('SIGTERM');
    await exitPromise;
  }
});
