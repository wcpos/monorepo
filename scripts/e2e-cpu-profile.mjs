#!/usr/bin/env node
// Hermes CPU profile collector for the native E2E suite (probe #3552), through Metro's inspector.
// React Native 0.88 has no CDP Profiler domain, so each window is a CDP trace (Tracing.start/end)
// whose Profile/ProfileChunk events are rebuilt into .cpuprofile files.
// Every outcome is one `WCPOS_PROFILE status=<word>` line; the exit code is always 0.
// Usage: node scripts/e2e-cpu-profile.mjs <out dir> <stop marker path> [<start file> <start pattern>]
// With a start file and pattern, Metro is not contacted until a line of the file matches the pattern.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import WebSocket from 'ws';

export const METRO_ORIGIN = 'http://localhost:8081'; // The only host this probe talks to: Metro on the runner.
// Expo CLI's debugger socket check compares the Origin host with its serverBaseUrl, which `expo start`
// normalises to 127.0.0.1; a mismatch is terminate()d (close code 1006).
export const EXPO_SERVER_ORIGIN = 'http://127.0.0.1:8081';
export const WINDOW_MS = 30_000; // One file per 30 s: a relaunch loses at most one window.
const POLL_MS = 2_000; // How often /json/list is asked for a target while none is attached.
const REPLY_TIMEOUT_MS = 10_000; // A reply slower than this means the app went away; drop the window.
// A slow emulator can take longer than REPLY_TIMEOUT_MS to stop a 30 s trace and stream its chunks.
const TRACE_FLUSH_TIMEOUT_MS = 60_000;
const MAX_RUN_MS = 4 * 60 * 60 * 1000; // Safety cap: no native E2E job runs this long.
const TICK_MS = 250; // How often the stop marker and the window deadline are checked.
// The trace category that turns the Hermes sampling profiler on: react-native 0.88.1
// ReactCommon/jsinspector-modern RuntimeAgent.cpp (RuntimeTracingAgent), tracing/TracingCategory.h.
const TRACE_CATEGORIES = 'disabled-by-default-v8.cpu_profiler';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const reasonOf = (error) => JSON.stringify(String(error?.message ?? error).slice(0, 160));
class Lost extends Error {}

/** Rebuilds one .cpuprofile per Profile id from trace events (PerformanceTracer.cpp); times in µs. */
export function traceToCpuProfiles(events) {
	const profiles = new Map(); // Profile id -> { profile, seen: node ids already in profile.nodes }
	for (const { id, name, ts, args } of events.filter((e) => /^Profile(Chunk)?$/.test(e?.name))) {
		const { startTime, cpuProfile, timeDeltas } = args?.data ?? {};
		if (!profiles.has(id)) {
			const profile = { nodes: [], startTime: ts, samples: [], timeDeltas: [] }; // A chunk's ts until a Profile.
			profiles.set(id, { profile, seen: new Set() });
		}
		const { profile, seen } = profiles.get(id);
		if (name === 'Profile') profile.startTime = startTime ?? ts;
		for (const node of cpuProfile?.nodes ?? []) {
			if (!seen.has(node.id)) profile.nodes.push(node);
			seen.add(node.id);
		}
		profile.samples.push(...(cpuProfile?.samples ?? []));
		profile.timeDeltas.push(...(timeDeltas ?? []));
	}
	return [...profiles.values()].map(({ profile: p }) => ({
		...p,
		endTime: p.timeDeltas.reduce((t, d) => t + d, p.startTime),
	}));
}

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
	// Metro's verifyClient refuses a missing Origin (ws sends none) and Expo's check a non-127.0.0.1 host.
	const ws = new WebSocket(url, { handshakeTimeout: REPLY_TIMEOUT_MS, origin: EXPO_SERVER_ORIGIN });
	const pending = new Map(); // command id, or event method for next() -> settle(error, message)
	const listeners = new Map(); // event method -> Set of fn(params)
	let nextId = 0;
	ws.on('error', () => {}); // 'close' always follows and carries the outcome.
	let closed = 'socket closed'; // Gains the close code and reason once the socket closes.
	ws.on('close', (code, reason) => {
		closed = `socket closed code=${code} reason=${String(reason).slice(0, 80)}`;
		[...pending.values()].forEach((settle) => settle(new Lost(closed)));
	});
	ws.on('message', (data) => {
		try {
			const message = JSON.parse(String(data)); // An event has no id: its listeners, then next().
			if (message?.id === undefined)
				listeners.get(message?.method)?.forEach((fn) => fn(message.params ?? {}));
			const key = message?.id ?? message?.method; // Command ids are numbers, never a method name.
			pending.get(key)?.(message.error ? new Error(message.error.message) : null, message);
		} catch {
			// Not JSON: ignored like any event.
		}
	});
	const session = {
		closeMessage: () => closed,
		isOpen: () => ws.readyState === WebSocket.OPEN,
		close: () => ws.terminate(),
		/** Calls fn(params) on every `method` event until the returned function is called. */
		on: (method, fn) => {
			listeners.set(method, (listeners.get(method) ?? new Set()).add(fn));
			return () => listeners.get(method).delete(fn);
		},
		/** Resolves on the next `method` event; a Lost on close or after timeoutMs. */
		next: (method, timeoutMs = REPLY_TIMEOUT_MS) =>
			new Promise((resolve, reject) => {
				if (!session.isOpen()) return reject(new Lost(closed));
				const timeout = new Lost(`no ${method.split('.').pop()} in ${timeoutMs} ms`);
				const timer = setTimeout(() => pending.get(method)?.(timeout), timeoutMs);
				pending.set(method, (error) => {
					pending.delete(method);
					clearTimeout(timer);
					if (error) reject(error);
					else resolve();
				});
			}),
		send: (method, params = {}) =>
			new Promise((resolve, reject) => {
				if (!session.isOpen()) return reject(new Lost(closed));
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
		let refused; // Set when the server answers the upgrade with an HTTP error.
		ws.once(
			'unexpected-response',
			(req, res) => (refused = `upgrade refused status=${res.statusCode}`)
		);
		ws.once('close', () =>
			reject(new Lost(refused ?? `${closed.replace('closed', 'closed before open')}`))
		);
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

/** Ends the trace; resolves with every Tracing.dataCollected event once tracingComplete arrives. */
async function endTrace(session) {
	const events = []; // Listen before sending: the reply and the events can arrive in one read.
	const off = session.on('Tracing.dataCollected', ({ value }) => events.push(...(value ?? [])));
	try {
		await Promise.all([
			session.send('Tracing.end'),
			session.next('Tracing.tracingComplete', TRACE_FLUSH_TIMEOUT_MS),
		]);
		return events;
	} finally {
		off();
	}
}

/** Profiles one target until it is lost (null) or a stop is due (its status). */
async function profileTarget(target, outDir, stopReason) {
	const { id } = target;
	let session;
	let start;
	try {
		session = await openSession(target);
		start = Date.now();
		await session.send('Tracing.start', { categories: TRACE_CATEGORIES });
		report('connected', { id, start });
		for (;;) {
			const outcome = await waitWindow(session, start + WINDOW_MS, stopReason);
			if (outcome === 'lost') throw new Lost(session.closeMessage());
			const end = Date.now();
			const profiles = traceToCpuProfiles(await endTrace(session)).filter((p) => p.samples.length);
			let bytes = 0;
			profiles.forEach((profile, n) => {
				const body = JSON.stringify(profile);
				const suffix = profiles.length > 1 ? `-${n + 1}` : '';
				writeFileSync(join(outDir, `profile-${start}-${end}${suffix}.cpuprofile`), body);
				bytes += Buffer.byteLength(body);
			});
			report('window', { id, start, end, bytes });
			if (outcome) return outcome;
			start = Date.now();
			await session.send('Tracing.start', { categories: TRACE_CATEGORIES });
		}
	} catch (error) {
		const end = start === undefined ? undefined : Date.now();
		report(error instanceof Lost ? 'lost' : 'error', { id, start, end, reason: reasonOf(error) });
		return null;
	} finally {
		session?.close();
	}
}

const gateOpen = (file, pattern) => {
	try {
		return readFileSync(file, 'utf8')
			.split('\n')
			.some((line) => new RegExp(pattern).test(line));
	} catch {
		return false; // A missing file counts as no match.
	}
};

export async function collect(outDir, marker, startFile, startPattern) {
	mkdirSync(outDir, { recursive: true });
	const deadline = Date.now() + MAX_RUN_MS;
	const stopReason = () =>
		existsSync(marker) ? 'stopped' : Date.now() >= deadline ? 'capped' : null;
	if (startFile && startPattern) {
		while (!gateOpen(startFile, startPattern)) {
			if (stopReason()) return report(stopReason());
			await sleep(POLL_MS);
		}
		report('armed');
	}
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
	collect(...process.argv.slice(2, 6))
		.catch(fail)
		.finally(() => process.exit(0));
}
