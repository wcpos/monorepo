import * as Linking from 'expo-linking';
import { File, Paths } from 'expo-file-system';

import { captureLogs } from './logs';
import { installPolyfills } from './polyfills';
import versions from './versions.json';

import type { Job, Send } from './types';
const POLL_MS = 500; // Driver contract: 204 means idle; poll at half-second cadence.
const saved = new File(Paths.document, 'spike2091-driver.txt');
type State = { url: string; status: string; job: string; event: string };
let state: State = {
	url: saved.exists ? saved.textSync() : '',
	status: 'IDLE',
	job: '',
	event: '',
};
const listeners = new Set<() => void>();
const update = (value: Partial<State>) => {
	state = { ...state, ...value };
	for (const fn of listeners) fn();
};
export const subscribe = (fn: () => void) => {
	listeners.add(fn);
	return () => {
		listeners.delete(fn);
	};
};
export const getState = () => state;
export function connect(url: string) {
	const parsed = new URL(url);
	if (parsed.protocol !== 'http:') throw new Error('Driver URL must use http');
	saved.write(parsed.origin);
	update({ url: parsed.origin, status: 'IDLE' });
}
function launchURL(url: string | null) {
	if (!url) return;
	const value = Linking.parse(url).queryParams?.url;
	if (typeof value === 'string') connect(value);
}
async function run(job: Job, send: Send) {
	// Initialize storage after the driver has a job id, so module/init failures are reportable.
	installPolyfills();
	const { runBench, coldRead } = require('./bench') as typeof import('./bench');
	const { writer, scorer } = require('./crash') as typeof import('./crash');
	const { openEngine } = require('./engines') as typeof import('./engines');
	const { runConformanceSmoke } =
		require('./conformance-smoke') as typeof import('./conformance-smoke');
	const { divergenceProbes } = require('./divergence') as typeof import('./divergence');
	if (job.type === 'bench') return runBench(job, send);
	if (job.type === 'cold-open') return coldRead(job);
	if (job.type === 'crash-write') return writer(job, send);
	if (job.type === 'crash-score') return scorer(job, send);
	if (job.type !== 'smoke') throw new Error(`Unknown job ${job.type}`);
	const session = await openEngine(job.row, job.dir, job.db);
	try {
		const scenarios = await runConformanceSmoke(session, (result) =>
			update({ event: `${result.name}: ${result.pass ? 'PASS' : 'FAIL'}` })
		);
		scenarios.push(...(await divergenceProbes(session)));
		return { scenarios, ...session.proofs };
	} finally {
		await session.close();
	}
}
async function poll() {
	while (true) {
		if (state.url) {
			try {
				const url = state.url,
					response = await fetch(url + '/job');
				if (response.status !== 204) {
					if (!response.ok) throw new Error(`GET /job: ${response.status}`);
					const job: Job = await response.json();
					update({ status: 'RUNNING', job: `${job.type} / ${job.row} / ${job.scale ?? ''}` });
					const post = async (path: string, body: unknown) => {
						const result = await fetch(url + path, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify(body),
						});
						if (!result.ok) throw new Error(`POST ${path}: ${result.status}`);
					};
					const send: Send = async (event) => {
						update({ event: String(event.type) });
						await post('/event', { id: job.id, ...event });
					};
					const capture = captureLogs(() => {
						void send({ type: 'begin-retry' }).catch(() => {});
					});
					let result: unknown, error: string | undefined;
					try {
						result = await run(job, send);
					} catch (e) {
						error = e instanceof Error ? e.stack : String(e);
					} finally {
						capture.restore();
					}
					const beginRetries = capture.logs.filter((line) =>
						/open transaction error \(will retry\)/.test(line)
					).length;
					await post('/result', { id: job.id, result, error, versions, beginRetries });
					update({ status: error ? 'ERROR' : 'DONE', event: error ?? 'Result saved on Mac' });
				}
			} catch (error) {
				update({ status: 'ERROR', event: String(error) });
			}
		}
		await new Promise((resolve) => setTimeout(resolve, POLL_MS));
	}
}
// One external device protocol loop for the app lifetime, not a React render side effect.
Linking.addEventListener('url', (event) => {
	try {
		launchURL(event.url);
	} catch (error) {
		update({ status: 'ERROR', event: String(error) });
	}
});
void Linking.getInitialURL()
	.then(launchURL)
	.then(poll)
	.catch((error) => update({ status: 'ERROR', event: String(error) }));
