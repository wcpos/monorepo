#!/usr/bin/env node
/**
 * Queue web and native E2E runs before their first dev-next request.
 * Front desk ruling B, 2026-10-01: six web shards and two native dispatches
 * saturated dev-next's six php-fpm workers (1,898 requests returned 499;
 * every device failed at the connect screen).
 *
 * Admit only with no holder and no older waiting run. Two consecutive clear
 * polls, one interval apart, let lagging API step status reveal contenders.
 * A successful queue step holds the store until its whole run completes,
 * covering web shards and the native device phase. PRs targeting next skip
 * both suites, so PR runs cannot reach dev-next and are skipped in API scans.
 */
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

export const QUEUE_STEP_NAME = '🚦 Queue for dev-next';
export const QUEUE_WORKFLOWS = ['deploy.yml', 'e2e-native.yml'];
/** Between polls. ~5 API calls a poll stays far below GITHUB_TOKEN's 1,000/h. */
export const POLL_INTERVAL_MS = 90_000;
/** One native holder can run ~3.5 h worst case (EAS build + 130-min device job). */
export const MAX_WAIT_MS = 240 * 60_000;
/** A broken token or API outage fails the step instead of waiting 4 h. */
export const MAX_CONSECUTIVE_ERRORS = 5;

export function queueState(jobs) {
	const step = jobs.flatMap((job) => job.steps ?? []).find(({ name }) => name === QUEUE_STEP_NAME);
	if (step?.status === 'in_progress') return 'waiting';
	if (step?.status === 'completed' && step.conclusion === 'success') return 'holding';
	return 'none';
}

export function blockersFor(ownRunId, runs) {
	return runs.filter(
		({ id, state }) =>
			Number(id) !== Number(ownRunId) &&
			(state === 'holding' || (state === 'waiting' && Number(id) < Number(ownRunId)))
	);
}

export async function waitForDevNext({
	ownRunId,
	listRuns,
	listJobs,
	sleep,
	now,
	log,
	pollIntervalMs = POLL_INTERVAL_MS,
	maxWaitMs = MAX_WAIT_MS,
	maxConsecutiveErrors = MAX_CONSECUTIVE_ERRORS,
}) {
	const start = now();
	let clearPolls = 0;
	let errors = 0;
	let blockers = [];
	while (true) {
		try {
			const runs = [];
			for (const run of await listRuns()) {
				if (Number(run.id) === Number(ownRunId) || run.event === 'pull_request') continue;
				runs.push({
					id: Number(run.id),
					state: queueState(await listJobs(run.id)),
					url: run.html_url,
				});
			}
			blockers = blockersFor(ownRunId, runs);
			errors = 0;
			if (blockers.length) {
				clearPolls = 0;
				log(
					`Waiting for dev-next: ${blockers
						.map(
							({ url, state }) =>
								`${url} (${state === 'holding' ? 'holding' : 'older run waiting'})`
						)
						.join(', ')}`
				);
			} else {
				clearPolls++;
				if (clearPolls === 2) {
					const waitedMs = now() - start;
					log(`dev-next is free; proceeding after ${Math.round(waitedMs / 60_000)} min`);
					return { admitted: true, waitedMs };
				}
				log(`dev-next looks free; confirming in ${pollIntervalMs / 1000} s`);
			}
		} catch (error) {
			clearPolls = 0;
			errors++;
			log(`::warning::${error.message}`);
			if (errors >= maxConsecutiveErrors) {
				return { admitted: false, waitedMs: now() - start, blockers, reason: 'errors' };
			}
		}
		if (now() - start + pollIntervalMs > maxWaitMs) {
			return { admitted: false, waitedMs: now() - start, blockers, reason: 'timeout' };
		}
		await sleep(pollIntervalMs);
	}
}

async function main() {
	const {
		GITHUB_RUN_ID,
		GITHUB_REPOSITORY,
		GH_TOKEN,
		GITHUB_API_URL = 'https://api.github.com',
	} = process.env;
	if (!GITHUB_RUN_ID || !GITHUB_REPOSITORY || !GH_TOKEN) {
		console.log('::error::GITHUB_RUN_ID, GITHUB_REPOSITORY and GH_TOKEN are required');
		process.exitCode = 1;
		return;
	}
	const base = `${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/actions`;
	async function get(url) {
		const response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${GH_TOKEN}`,
				Accept: 'application/vnd.github+json',
				'X-GitHub-Api-Version': '2022-11-28',
			},
		});
		if (!response.ok) throw new Error(`GitHub API ${response.status}: ${url}`);
		return response.json();
	}
	const result = await waitForDevNext({
		ownRunId: Number(GITHUB_RUN_ID),
		listRuns: async () => {
			const runs = [];
			for (const file of QUEUE_WORKFLOWS) {
				const data = await get(`${base}/workflows/${file}/runs?status=in_progress&per_page=100`);
				runs.push(...data.workflow_runs);
			}
			return runs;
		},
		listJobs: async (id) => (await get(`${base}/runs/${id}/jobs?filter=latest&per_page=100`)).jobs,
		sleep,
		now: Date.now,
		log: console.log,
	});
	if (!result.admitted) {
		console.log(
			`::error title=dev-next queue::${result.reason} after ${Math.round(result.waitedMs / 60_000)} min; blockers: ${result.blockers.map(({ url }) => url).join(', ')}`
		);
	}
	process.exitCode = result.admitted ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main();
}
