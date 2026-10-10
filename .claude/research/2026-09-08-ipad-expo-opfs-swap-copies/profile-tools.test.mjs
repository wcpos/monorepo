import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const exec = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));

const withTempDir = async (run) => {
	const dir = await mkdtemp(path.join(tmpdir(), 'wcpos-profile-tools-'));
	try {
		await run(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
};

const withTargetServer = async (targets, run) => {
	const server = createServer((_request, response) => {
		response.setHeader('Content-Type', 'application/json');
		response.end(JSON.stringify(targets));
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	try {
		const { port } = server.address();
		await run(`http://127.0.0.1:${port}`);
	} finally {
		await new Promise((resolve) => server.close(resolve));
	}
};

test('aggregates duplicate frames without double-counting recursion', async () => {
	await withTempDir(async (dir) => {
		const prefix = path.join(dir, 'profile');
		const frame = (functionName) => ({ functionName, url: '', lineNumber: 0, columnNumber: 0 });
		const events = [{
			args: { data: {
				cpuProfile: {
					nodes: [
						{ id: 1, callFrame: frame('(root)'), children: [2, 3] },
						{ id: 2, callFrame: frame('work') },
						{ id: 3, callFrame: frame('work'), children: [4] },
						{ id: 4, callFrame: frame('work') },
					],
					samples: [2, 4],
				},
				timeDeltas: [1000, 2000],
			} },
		}];
		await writeFile(`${prefix}.trace.json`, JSON.stringify(events));
		await exec(process.execPath, [path.join(here, 'cdp-profile.mjs'), 'report', prefix]);
		const report = await readFile(`${prefix}.report.txt`, 'utf8');
		const inclusive = report.split('== total (inclusive) time ==')[1];
		assert.match(inclusive, /^\s+3 ms\s+100\.0%\s+work native:1:1$/m);
	});
});

test('rejects a display-title match without the WCPOS app ID', async () => {
	await withTargetServer([
		{ appId: 'com.example.other', title: 'com.wcpos.main.dev', webSocketDebuggerUrl: 'ws://127.0.0.1:1' },
	], async (metro) => {
		for (const script of ['cdp-profile.mjs', 'cdp-heapsnapshot.mjs', 'cdp-errors.mjs']) {
			await assert.rejects(
				exec(process.execPath, [path.join(here, script), '0'], { env: { ...process.env, WCPOS_METRO_URL: metro } }),
				(error) => error.stderr.includes('no inspector target for com.wcpos.main.dev'),
			);
		}
	});
});

test('resolves the heap profiler WebSocket dependency from this checkout', async () => {
	await withTargetServer([], async (metro) => {
		await exec(process.execPath, [path.join(here, 'cdp-heap.mjs')], {
			env: { ...process.env, WCPOS_METRO_URL: metro },
		});
	});
});

test('uses the requested device, committed parser, and copy exit status', async () => {
	await withTempDir(async (dir) => {
		const bin = path.join(dir, 'bin');
		await mkdir(bin);
		const xcrun = path.join(bin, 'xcrun');
		await writeFile(xcrun, `#!/bin/bash
device=''
destination=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --device) device=$2; shift 2 ;;
    --destination) destination=$2; shift 2 ;;
    *) shift ;;
  esac
done
[ "$device" = expected-device ] || exit 23
mkdir -p "$destination/rxdb-logs"
printf '{"one":{}}\\n' > "$destination/rxdb-logs/documents.json"
echo copied
`);
		await exec('chmod', ['+x', xcrun]);
		const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
		const out = path.join(dir, 'success');
		const result = await exec('bash', [path.join(here, 'pull-rows.sh'), 'expected-device', out], { env });
		assert.match(result.stdout, /1 docs in file/);

		await writeFile(xcrun, '#!/bin/bash\nexit 37\n');
		await assert.rejects(
			exec('bash', [path.join(here, 'pull-rows.sh'), 'expected-device', path.join(dir, 'failure')], { env }),
			(error) => error.code === 37,
		);
	});
});

test('pins and verifies Maestro before an unattended install', async () => {
	const prompt = await readFile(path.join(here, 'overnight-cashier-prompt.md'), 'utf8');
	assert.match(prompt, /MAESTRO_VERSION=2\.6\.1/);
	assert.match(prompt, /MAESTRO_SHA256=3440825f514f537c6a96bcf5de995780c2a4a7f83a43208fdc95d4f1fecfad3b/);
	assert.match(prompt, /shasum -a 256 -c -/);
	assert.doesNotMatch(prompt, /get\.maestro\.mobile\.dev[^\n]*\|\s*bash/);
});
