#!/usr/bin/env node
// Hermes CPU profile collector for the native E2E suite (probe #3552), through Metro's inspector.
// Every outcome is one `WCPOS_PROFILE status=<word>` line; the exit code is always 0.
// Usage: node scripts/e2e-cpu-profile.mjs <out dir> <stop marker path>
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import WebSocket from 'ws';

export const METRO_ORIGIN = 'http://localhost:8081'; // The only host this probe talks to: Metro on the runner.
export const WINDOW_MS = 30_000; // One file per 30 s: a relaunch loses at most one window.
const POLL_MS = 2_000; // How often /json/list is asked for a target while none is attached.
const REPLY_TIMEOUT_MS = 10_000; // A reply slower than this means the app went away; drop the window.
const MAX_RUN_MS = 4 * 60 * 60 * 1000; // Safety cap: no native E2E job runs this long.
const TICK_MS = 250; // How often the stop marker and the window deadline are checked.
const SAMPLING_INTERVAL_US = 1_000; // 1 ms sampling resolves a single render pass.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const reasonOf = (error) => JSON.stringify(String(error?.message ?? error).slice(0, 160));
class Lost extends Error {}

function report(status, fields = {}) {
	const parts = Object.entries(fields).filter(([, value]) => value !== undefined);
	console.log([`WCPOS_PROFILE status=${status}`, ...parts.map(([k, v]) => `${k}=${v}`)].join(' '));
}

async function findTarget() {
	const signal = AbortSignal.timeout(REPLY_TIMEOUT_MS);
	const targets = await fetch(`${METRO_ORIGIN}/json/list`, { redirect: 'error', signal })
		.then((response) => (response.ok ? response.json() : []))
		.catch(() => []); // Metro busy or no app yet; the next poll asks again.
	return (Array.isArray(targets) ? targets : []).filter((t) => t?.webSocketDebuggerUrl).at(-1);
}

/** Opens the target's socket, pinned to METRO_ORIGIN whatever host the proxy advertises. */
function openSession(target) {
	const { pathname, search } = new URL(target.webSocketDebuggerUrl);
	const url = new URL(pathname + search, METRO_ORIGIN.replace(/^http/, 'ws'));
	const ws = new WebSocket(url, { handshakeTimeout: REPLY_TIMEOUT_MS });
	const pending = new Map(); // command id -> settle(error, message)
	let nextId = 0;
	ws.on('error', () => {}); // 'close' always follows and carries the outcome.
	ws.on('close', () =>
		[...pending.values()].forEach((settle) => settle(new Lost('socket closed')))
	);
	ws.on('message', (data) => {
		try {
			const message = JSON.parse(String(data)); // Events carry no id and match nothing.
			pending.get(message?.id)?.(message.error ? new Error(message.error.message) : null, message);
		} catch {
			// Not JSON: ignored like any event.
		}
	});
	const session = {
		isOpen: () => ws.readyState === WebSocket.OPEN,
		close: () => ws.terminate(),
		send: (method, params = {}) =>
			new Promise((resolve, reject) => {
				if (!session.isOpen()) return reject(new Lost('socket closed'));
				const id = ++nextId;
				const timeout = new Lost(`no reply to ${method} in ${REPLY_TIMEOUT_MS} ms`);
				const timer = setTimeout(() => pending.get(id)?.(timeout), REPLY_TIMEOUT_MS);
				pending.set(id, (error, message) => {
					pending.delete(id);
					clearTimeout(timer);
					if (error) reject(error);
					else resolve(message.result ?? {});
				});
				ws.send(JSON.stringify({ id, method, params }));
			}),
	};
	return new Promise((resolve, reject) => {
		ws.once('open', () => resolve(session));
		ws.once('close', () => reject(new Lost('socket closed before open')));
	});
}

/** Waits out one window: 'stopped' / 'capped' when a stop is due, 'lost' on a close, else null. */
async function waitWindow(session, until, stopReason) {
	for (; Date.now() < until; await sleep(TICK_MS)) {
		if (stopReason()) return stopReason();
		if (!session.isOpen()) return 'lost';
	}
	return stopReason();
}

/** Profiles one target until it is lost (null) or a stop is due (its status). */
async function profileTarget(target, outDir, stopReason) {
	const { id } = target;
	let session;
	let start;
	try {
		session = await openSession(target);
		await session.send('Profiler.enable');
		await session
			.send('Profiler.setSamplingInterval', { interval: SAMPLING_INTERVAL_US })
			.catch((error) => {
				if (error instanceof Lost) throw error; // An error reply is fine; a dead socket is not.
			});
		start = Date.now();
		await session.send('Profiler.start');
		report('connected', { id, start });
		for (;;) {
			const outcome = await waitWindow(session, start + WINDOW_MS, stopReason);
			if (outcome === 'lost') throw new Lost('socket closed');
			const end = Date.now();
			const body = JSON.stringify((await session.send('Profiler.stop')).profile ?? null);
			writeFileSync(join(outDir, `profile-${start}-${end}.cpuprofile`), body);
			report('window', { id, start, end, bytes: Buffer.byteLength(body) });
			if (outcome) return outcome;
			start = Date.now();
			await session.send('Profiler.start');
		}
	} catch (error) {
		const end = start === undefined ? undefined : Date.now();
		report(error instanceof Lost ? 'lost' : 'error', { id, start, end, reason: reasonOf(error) });
		return null;
	} finally {
		session?.close();
	}
}

export async function collect(outDir, marker) {
	mkdirSync(outDir, { recursive: true });
	const deadline = Date.now() + MAX_RUN_MS;
	const stopReason = () =>
		existsSync(marker) ? 'stopped' : Date.now() >= deadline ? 'capped' : null;
	for (;;) {
		if (stopReason()) return report(stopReason());
		const target = await findTarget();
		const outcome = target ? await profileTarget(target, outDir, stopReason) : null;
		if (outcome) return report(outcome);
		await sleep(POLL_MS);
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const fail = (error) => report('error', { reason: reasonOf(error) });
	process.on('uncaughtException', (error) => (fail(error), process.exit(0)));
	collect(...process.argv.slice(2, 4))
		.catch(fail)
		.finally(() => process.exit(0));
}
