#!/usr/bin/env node
/**
 * Probe an E2E store's responsiveness and say plainly whether it is healthy
 * enough for the run's results to mean anything.
 *
 * Why this exists: on 2026-08-19 every main-lane gate went red at global-setup
 * because the shared dev store's PHP pool was saturated by concurrent CI runs —
 * not because any diff was wrong. Read as ordinary failures, those reds sent
 * people (and agents) hunting bugs in their own code for hours. A saturated
 * store is an environment fact, and CI should say so in its own voice.
 *
 * Exit code is ALWAYS 0: this reports, it never gates. A slow store still
 * produces a usable run; the point is that the annotation is there when the
 * failures are read.
 *
 * Usage: node scripts/probe-store-health.mjs <storeUrl> [label] [phase]
 */

const SAMPLES = 3;
const REQUEST_TIMEOUT_MS = 20_000;
/** Above this, queueing is real and flakes should be read as environmental. */
const DEGRADED_MS = 3_000;
/** Above this, the store is effectively unusable for a parallel E2E run. */
const SATURATED_MS = 8_000;

function annotate(level, title, message) {
	// GitHub picks these up as run annotations; harmless locally.
	console.log(`::${level} title=${title}::${message}`);
}

async function sample(url, fallbackUrl) {
	const started = Date.now();
	try {
		let response = await fetch(url, {
			headers: { 'X-WCPOS': '1' },
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
		if (response.status === 404) {
			response = await fetch(fallbackUrl, {
				headers: { 'X-WCPOS': '1' },
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			});
		}
		// 401 is expected and fine — it proves PHP answered, which is what we measure.
		return { ms: Date.now() - started, status: response.status };
	} catch (error) {
		return {
			ms: Date.now() - started,
			status: 0,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

const storeUrl = process.argv[2];
const label = process.argv[3] ?? storeUrl;
const phase = process.argv[4] ?? 'at probe time';
if (!storeUrl) {
	console.log('probe-store-health: no store URL given, nothing to probe');
	process.exit(0);
}

const root = storeUrl.replace(/\/+$/, '');
const endpoint = `${root}/wp-json/wcpos/v2/auth/test`;
const fallbackEndpoint = `${root}/index.php?rest_route=/wcpos/v2/auth/test`;
const results = [];
for (let index = 0; index < SAMPLES; index += 1) {
	results.push(await sample(endpoint, fallbackEndpoint));
}

const timings = results.map((result) => result.ms).sort((a, b) => a - b);
const median = timings[Math.floor(timings.length / 2)];
const failures = results.filter((result) => result.status === 0).length;
const summary = results
	.map((result) =>
		result.status === 0 ? `timeout(${result.ms}ms)` : `${result.status}/${result.ms}ms`
	)
	.join(' ');

console.log(`[store-health] ${label} ${endpoint}`);
console.log(`[store-health] samples: ${summary} — median ${median}ms`);

if (failures > 0 || median >= SATURATED_MS) {
	annotate(
		'error',
		'E2E store saturated',
		`${label} responded in ${median}ms median (${failures} timeout(s)) ${phase}. ` +
			`Failures in this run are very likely environmental — the store could not serve the run, ` +
			`whatever the diff does. Re-run when the queue drains rather than debugging the diff.`
	);
} else if (median >= DEGRADED_MS) {
	annotate(
		'warning',
		'E2E store degraded',
		`${label} responded in ${median}ms median ${phase} (healthy is well under ` +
			`${DEGRADED_MS}ms). Treat timeouts and global-setup failures in this run as suspect.`
	);
} else {
	console.log(`[store-health] ${label} healthy (median ${median}ms)`);
}

process.exit(0);
