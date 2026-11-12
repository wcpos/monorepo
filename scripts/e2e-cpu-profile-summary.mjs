#!/usr/bin/env node
// Report for scripts/e2e-cpu-profile.mjs: top functions by self time over one Maestro flow, named
// through Metro's source map (held in memory, never saved). Always exits 0. Usage:
// node scripts/e2e-cpu-profile-summary.mjs <profile dir> <maestro tests dir> <flow> [--top 20]
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SourceMapConsumer } from 'source-map-js';

const METRO_ORIGIN = 'http://localhost:8081'; // Source maps come from Metro on the runner, nowhere else.
const MAP_TIMEOUT_MS = 90_000; // Metro builds the map on first request; the bundle itself is warm.
const SPECIAL = ['(idle)', '(garbage collector)', '(program)']; // Header figures; the first two never rank.

export function flowWindow(commands) {
	const meta = commands.map((c) => c?.metadata).filter((m) => Number.isFinite(m?.timestamp));
	if (meta.length === 0) return null;
	const start = Math.min(...meta.map((m) => m.timestamp));
	return { start, end: Math.max(...meta.map((m) => m.timestamp + (Number(m.duration) || 0))) };
}

/** Self µs per node id: each sample owns the delta to the next sample; the last runs to endTime. */
export function selfTimes({ samples = [], timeDeltas = [], startTime, endTime }) {
	const lastSampleTime = timeDeltas.slice(0, samples.length).reduce((t, d) => t + d, startTime);
	const self = new Map();
	samples.forEach((node, i) => {
		const delta = i + 1 < samples.length ? timeDeltas[i + 1] : endTime - lastSampleTime;
		self.set(node, (self.get(node) ?? 0) + Math.max(0, delta || 0));
	});
	return self;
}

export const shortSource = (source) =>
	/(?:^|\/)((?:node_modules|packages|apps)\/.*)$/.exec(source)?.[1] ?? source;

/** maps: bundle URL -> SourceMapConsumer, or null when unavailable. */
export const symbolicatorFor =
	(maps) =>
	({ url, lineNumber, columnNumber }) => {
		const pos = maps.get(url)?.originalPositionFor({ line: lineNumber + 1, column: columnNumber });
		return pos?.source ? { name: pos.name, where: `${shortSource(pos.source)}:${pos.line}` } : null;
	};

function frameKey(frame, symbolicate) {
	if (!frame.url) return { name: frame.functionName ?? '', where: '' };
	const name = frame.functionName || '(anonymous)';
	const sym = symbolicate(frame);
	const bundle = frame.url.split('?')[0].split('/').pop();
	return sym
		? { name: sym.name || name, where: sym.where }
		: { name, where: `${bundle}:${frame.lineNumber + 1}:${frame.columnNumber}` };
}

export function topFunctions(profiles, symbolicate, n) {
	const groups = new Map();
	let totalUs = 0;
	for (const profile of profiles) {
		const frames = new Map(profile.nodes.map((node) => [node.id, node.callFrame ?? {}]));
		for (const [nodeId, us] of selfTimes(profile)) {
			const { name, where } = frameKey(frames.get(nodeId) ?? {}, symbolicate);
			const key = where ? `${name} @ ${where}` : name;
			groups.set(key, { name, where, us: (groups.get(key)?.us ?? 0) + us });
			totalUs += us;
		}
	}
	const [idleMs, gcMs, programMs] = SPECIAL.map((key) => (groups.get(key)?.us ?? 0) / 1000);
	const nonIdleMs = totalUs / 1000 - idleMs - gcMs;
	const rows = [...groups]
		.filter(([key]) => !SPECIAL.slice(0, 2).includes(key))
		.map(([, { name, where, us }]) => ({ name, where, selfMs: us / 1000 }))
		.sort((a, b) => b.selfMs - a.selfMs)
		.slice(0, n)
		.map((row) => ({ ...row, pct: nonIdleMs > 0 ? (100 * row.selfMs) / nonIdleMs : 0 }));
	return { totalMs: totalUs / 1000, idleMs, gcMs, programMs, rows };
}

async function loadMaps(urls) {
	const maps = new Map();
	const status = new Set();
	for (const url of urls) {
		const mapUrl = URL.parse(url.replace('.bundle?', '.map?'));
		const allowed = mapUrl?.origin === METRO_ORIGIN && url.includes('.bundle?'); // Never any other host.
		const signal = AbortSignal.timeout(MAP_TIMEOUT_MS);
		const map = allowed
			? await fetch(mapUrl, { redirect: 'error', signal })
					.then(async (response) => new SourceMapConsumer(await response.json()))
					.catch(() => null)
			: null;
		maps.set(url, map);
		status.add(allowed ? (map ? 'ok' : 'unavailable') : 'refused');
	}
	return { maps, status: [...status].join(',') || 'none' };
}

function readJson(path) {
	try {
		return JSON.parse(readFileSync(path, 'utf8'));
	} catch {
		return null;
	}
}

const list = (dir) => (existsSync(dir) ? readdirSync(dir) : []);

async function summarise(profileDir, testsDir, flow, top) {
	const files = list(profileDir).flatMap((file) => {
		const m = /^profile-(\d+)-(\d+)\.cpuprofile$/.exec(file);
		return m ? [{ file, start: Number(m[1]), end: Number(m[2]) }] : [];
	});
	// A suite re-run leaves the flow in several run dirs; the last window is the run that counts.
	const window = list(testsDir)
		.map((dir) => readJson(join(testsDir, dir, `commands-(${flow}).json`)))
		.map((commands) => (Array.isArray(commands) ? flowWindow(commands) : null))
		.filter(Boolean)
		.sort((a, b) => a.end - b.end)
		.at(-1);
	const used = window ? files.filter((f) => f.start <= window.end && f.end >= window.start) : files;
	const profiles = used.map((f) => readJson(join(profileDir, f.file))).filter((p) => p?.nodes);
	const urls = new Set(profiles.flatMap((p) => p.nodes.map((node) => node.callFrame?.url)));
	const { maps, status } = await loadMaps([...urls].filter(Boolean));
	const r = topFunctions(profiles, symbolicatorFor(maps), top);
	const ms = (value) => String(Math.round(value));
	const share = (value) => `${ms(value)}ms (${((100 * value) / (r.totalMs || 1)).toFixed(1)}%)`;
	const span = window
		? `${window.start}-${window.end} (${((window.end - window.start) / 1000).toFixed(1)}s)`
		: 'all-profiles (no commands file)';
	const text = [
		`cpu-profile label=${process.env.WCPOS_PROFILE_LABEL || 'unknown'} flow=${flow} window=${span}` +
			` profiles=${used.length} unreadable=${used.length - profiles.length} map=${status}` +
			` sampledMs=${ms(r.totalMs)} idle=${share(r.idleMs)} gc=${share(r.gcMs)} program=${share(r.programMs)}`,
		...r.rows.map(
			(row, i) =>
				`${String(i + 1).padStart(2)} | ${ms(row.selfMs).padStart(6)} | ${row.pct.toFixed(1).padStart(5)}%` +
				` | ${row.name || '(empty)'} | ${row.where || '-'}`
		),
		`profiles used: ${used.map((f) => f.file).join(' ') || 'none'}\n`,
	].join('\n');
	process.stdout.write(text);
	mkdirSync(profileDir, { recursive: true });
	writeFileSync(join(profileDir, 'summary.txt'), text);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const [profileDir, testsDir, flow, ...rest] = process.argv.slice(2);
	const top = rest.includes('--top') ? Number(rest[rest.indexOf('--top') + 1]) || 20 : 20;
	summarise(profileDir, testsDir, flow, top)
		.catch((error) => console.log(`WCPOS_PROFILE status=error summary ${error?.message ?? error}`))
		.finally(() => process.exit(0));
}
