#!/usr/bin/env node
/**
 * Print the spec files one E2E shard should run.
 *
 * WHY THIS EXISTS. Playwright's `--shard` splits by TEST COUNT, not duration.
 * Measured on run 31429108622: every one of the six shards got exactly 26 tests,
 * and their workloads came out at 64s, 149s, 176s, 303s, 322s and 473s. The
 * slowest shard decides the gate's wall time, so the gate was paying for 473s
 * while a runner sat idle after 64s. Each shard also carries ~170s of fixed
 * overhead (checkout, install, browsers, health check, auth bootstrap), so extra
 * shards are not free either — past a point they cost more than they save.
 *
 * This bin-packs whole spec files by measured duration (longest-processing-time
 * first, onto the least-loaded shard), which is the standard greedy approximation
 * and lands within a few percent of optimal for this spread.
 *
 * Usage:
 *   node scripts/e2e-shard-plan.js <shardIndex> <shardTotal>   # 1-based index
 *   node scripts/e2e-shard-plan.js --plan <shardTotal>         # show the split
 *
 * SAFETY: the file list comes from disk, never from the timings file. A spec that
 * has never been measured still runs — it is assigned the median weight. Stale
 * timings cost balance, never coverage. The plan is also asserted to be a
 * partition: every spec lands in exactly one shard, or this exits non-zero rather
 * than silently dropping tests.
 */
/* eslint-env node */
/* global __dirname */
const fs = require('fs');
const path = require('path');

const E2E_DIR = path.join(__dirname, '..', 'e2e');
const TIMINGS_FILE = path.join(E2E_DIR, 'spec-timings.json');

/** Spec files Playwright would collect, excluding the opt-in cold-start subset. */
function listSpecFiles() {
	return fs
		.readdirSync(E2E_DIR)
		.filter((name) => name.endsWith('.spec.ts') && !name.endsWith('.cold.spec.ts'))
		.sort();
}

function loadTimings() {
	try {
		const parsed = JSON.parse(fs.readFileSync(TIMINGS_FILE, 'utf8'));
		return parsed.timings ?? {};
	} catch {
		return {};
	}
}

function buildPlan(shardTotal) {
	const files = listSpecFiles();
	const timings = loadTimings();

	const known = files.map((f) => timings[f]).filter((v) => typeof v === 'number' && v > 0);
	const sorted = [...known].sort((a, b) => a - b);
	// Median, not mean: one 200s outlier should not inflate the guess for a new
	// spec. Falls back to 60s when nothing has ever been measured.
	const fallback = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 60;

	const weighted = files
		.map((file) => ({ file, weight: timings[file] ?? fallback, measured: file in timings }))
		.sort((a, b) => b.weight - a.weight || a.file.localeCompare(b.file));

	const shards = Array.from({ length: shardTotal }, () => ({ files: [], total: 0 }));
	for (const item of weighted) {
		const target = shards.reduce((min, s) => (s.total < min.total ? s : min), shards[0]);
		target.files.push(item.file);
		target.total += item.weight;
	}

	// A dropped spec is a silently shrinking gate, so prove the plan is a
	// partition rather than trusting the loop above.
	const planned = shards.flatMap((s) => s.files).sort();
	if (planned.length !== files.length || planned.some((f, i) => f !== files[i])) {
		console.error(
			`[e2e-shard-plan] plan is not a partition: ${planned.length} planned vs ${files.length} on disk`
		);
		process.exit(1);
	}
	return { shards, weighted, fallback };
}

const args = process.argv.slice(2);

if (args[0] === '--plan') {
	const shardTotal = Number(args[1] || 4);
	const { shards, weighted, fallback } = buildPlan(shardTotal);
	const unmeasured = weighted.filter((w) => !w.measured);
	console.log(`Plan for ${shardTotal} shards (median fallback ${fallback}s):\n`);
	shards.forEach((s, i) => {
		console.log(`  shard ${i + 1}/${shardTotal} — ${s.total.toFixed(0)}s`);
		for (const f of s.files) console.log(`      ${f}`);
	});
	const totals = shards.map((s) => s.total);
	console.log(
		`\n  spread: min ${Math.min(...totals).toFixed(0)}s / max ${Math.max(...totals).toFixed(0)}s`
	);
	if (unmeasured.length) {
		console.log(
			`\n  UNMEASURED (assigned ${fallback}s each): ${unmeasured.map((w) => w.file).join(', ')}`
		);
	}
	process.exit(0);
}

const shardIndex = Number(args[0]);
const shardTotal = Number(args[1]);
if (!Number.isInteger(shardIndex) || !Number.isInteger(shardTotal) || shardIndex < 1) {
	console.error('usage: e2e-shard-plan.js <shardIndex> <shardTotal> | --plan <shardTotal>');
	process.exit(1);
}
if (shardIndex > shardTotal) {
	console.error(`[e2e-shard-plan] shard ${shardIndex} exceeds total ${shardTotal}`);
	process.exit(1);
}

const { shards } = buildPlan(shardTotal);
const files = shards[shardIndex - 1].files;
// ONE alternation regex, not a list of paths. Playwright's positional filters
// are combined with AND in this version — passing two file names matches
// nothing at all and the shard would silently run zero tests while reporting
// success. Verified: `playwright test a.spec.ts b.spec.ts` => "0 tests".
// Dots are escaped so `.spec.ts` cannot match `Xspec!ts`.
// An empty shard must NOT emit an empty string either: `playwright test` with no
// filter runs EVERYTHING. Emit a pattern that matches nothing instead.
const pattern = files.length
	? `(${files.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`
	: '__no_specs_for_this_shard__';
process.stdout.write(pattern);
