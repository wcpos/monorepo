import { writeFile } from 'node:fs/promises';

import type { CDPSession, TestInfo } from '@playwright/test';

/**
 * CPU profiling over CDP for a probe spec: record a window of work with Chromium's sampling
 * profiler, attach the raw `.cpuprofile` (opens in DevTools > Performance, or speedscope) and a
 * JSON summary of the top self-time functions, so a CI artifact is readable without a profiler UI.
 *
 * Self time is the sampled wall time spent in a frame itself, not its callees. A frame's samples
 * are summed across every call-tree node that names the same function+location, so one hot
 * function called from many places reads as one row.
 */

/** 1 ms: fine enough to resolve 50 ms long tasks into their functions, cheap enough not to become one. */
export const CPU_PROFILE_SAMPLING_INTERVAL_US = 1_000;
const TOP_FUNCTIONS = 25;

type CallFrame = {
	functionName: string;
	url: string;
	lineNumber: number;
	columnNumber: number;
};
type ProfileNode = { id: number; callFrame: CallFrame; hitCount?: number };
type CpuProfile = {
	nodes: ProfileNode[];
	startTime: number;
	endTime: number;
	samples?: number[];
	timeDeltas?: number[];
};

export type CpuProfileRow = {
	functionName: string;
	url: string;
	/** 1-based, as an editor or source-map lookup reads it (CDP's are 0-based). */
	line: number;
	column: number;
	selfTimeMs: number;
	hitCount: number;
};

export async function startCpuProfile(cdp: CDPSession): Promise<void> {
	await cdp.send('Profiler.enable');
	await cdp.send('Profiler.setSamplingInterval', { interval: CPU_PROFILE_SAMPLING_INTERVAL_US });
	await cdp.send('Profiler.start');
}

const basename = (url: string) => {
	if (!url) return '';
	const path = url.split(/[?#]/)[0];
	return path.slice(path.lastIndexOf('/') + 1) || url;
};

/** Top self-time frames, aggregated across call-tree nodes by function + script + position. */
export function summarizeCpuProfile(profile: CpuProfile, top = TOP_FUNCTIONS) {
	const samples = profile.samples ?? [];
	const deltas = profile.timeDeltas ?? [];
	// A sample's duration is the gap to the NEXT sample (timeDeltas[i] is the gap BEFORE sample i);
	// the last sample runs to the profile's end. All CDP times are microseconds.
	const timestamps: number[] = [];
	let timestamp = profile.startTime;
	for (let i = 0; i < samples.length; i += 1) {
		timestamp += deltas[i] ?? 0;
		timestamps.push(timestamp);
	}
	const selfUsByNode = new Map<number, number>();
	const hitsByNode = new Map<number, number>();
	samples.forEach((nodeId, i) => {
		const next = i + 1 < samples.length ? timestamps[i + 1] : profile.endTime;
		const duration = Math.max(0, next - timestamps[i]);
		selfUsByNode.set(nodeId, (selfUsByNode.get(nodeId) ?? 0) + duration);
		hitsByNode.set(nodeId, (hitsByNode.get(nodeId) ?? 0) + 1);
	});

	const rows = new Map<string, CpuProfileRow>();
	const byScript = new Map<string, number>();
	for (const node of profile.nodes) {
		const hits = hitsByNode.get(node.id) ?? 0;
		if (hits === 0) continue;
		const selfMs = (selfUsByNode.get(node.id) ?? 0) / 1000;
		const { functionName, url, lineNumber, columnNumber } = node.callFrame;
		const script = basename(url);
		const key = `${functionName}|${url}|${lineNumber}|${columnNumber}`;
		const row = rows.get(key) ?? {
			functionName: functionName || '(anonymous)',
			url: script,
			line: lineNumber + 1,
			column: columnNumber + 1,
			selfTimeMs: 0,
			hitCount: 0,
		};
		row.selfTimeMs += selfMs;
		row.hitCount += hits;
		rows.set(key, row);
		const scriptKey = script || functionName || '(native)';
		byScript.set(scriptKey, (byScript.get(scriptKey) ?? 0) + selfMs);
	}

	const round = (ms: number) => Math.round(ms * 10) / 10;
	return {
		durationMs: round((profile.endTime - profile.startTime) / 1000),
		samplingIntervalUs: CPU_PROFILE_SAMPLING_INTERVAL_US,
		totalSamples: samples.length,
		topSelfTime: [...rows.values()]
			.sort((a, b) => b.selfTimeMs - a.selfTimeMs)
			.slice(0, top)
			.map((row) => ({ ...row, selfTimeMs: round(row.selfTimeMs) })),
		selfTimeByScript: [...byScript.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, 10)
			.map(([url, selfTimeMs]) => ({ url, selfTimeMs: round(selfTimeMs) })),
	};
}

/**
 * Stop the profiler, write the raw profile into the test's output dir (under `test-results/`, which
 * CI uploads on failure) and attach it plus its summary. Call BEFORE any assertion that may fail.
 */
export async function stopCpuProfileAndAttach(
	cdp: CDPSession,
	testInfo: TestInfo,
	name: string,
	meta: Record<string, unknown> = {}
): Promise<ReturnType<typeof summarizeCpuProfile>> {
	const { profile } = (await cdp.send('Profiler.stop')) as { profile: CpuProfile };
	await cdp.send('Profiler.disable');
	const path = testInfo.outputPath(`${name}.cpuprofile`);
	await writeFile(path, JSON.stringify(profile));
	await testInfo.attach(`${name}.cpuprofile`, { path, contentType: 'application/json' });
	const summary = { ...meta, ...summarizeCpuProfile(profile) };
	const summaryJson = JSON.stringify(summary, null, 2);
	await writeFile(testInfo.outputPath(`${name}.cpuprofile-summary.json`), summaryJson);
	await testInfo.attach(`${name}.cpuprofile-summary.json`, {
		body: summaryJson,
		contentType: 'application/json',
	});
	return summary;
}
