import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

// The Mac mini's zone; launchd fires in local time.
export const RESET_TIME_ZONE = 'Europe/Madrid';
// The reset's local hour from com.kilbot.e2e-store-reset.
export const RESET_HOUR = 3;
// The reset's local minute from com.kilbot.e2e-store-reset.
export const RESET_MINUTE = 17;
// The e2e-setup step's 20-min cap plus one 60-min shard, plus 5 min margin.
export const RUN_BUDGET_MS = 85 * 60_000;
export const SHARD_BUDGET_MS = 65 * 60_000; // One 60-min shard plus 5 min margin, for shard-only reruns.
// The restore takes about a minute; margin for the php container restart.
export const SETTLE_MS = 10 * 60_000;

export function resetInstantNear(now) {
	const formatter = new Intl.DateTimeFormat('en-GB', {
		timeZone: RESET_TIME_ZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hourCycle: 'h23',
	});
	const day = Object.fromEntries(
		formatter.formatToParts(now).map(({ type, value }) => [type, Number(value)])
	);
	const wallTime = Date.UTC(day.year, day.month - 1, day.day, RESET_HOUR, RESET_MINUTE);
	// At 03:17 UTC Madrid has already made any DST change for this calendar day.
	const local = Object.fromEntries(
		formatter.formatToParts(wallTime).map(({ type, value }) => [type, Number(value)])
	);
	const offset =
		Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second) -
		wallTime;
	return new Date(wallTime - offset);
}

export function resetWaitMs(now, budgetMs = RUN_BUDGET_MS) {
	const today = resetInstantNear(now);
	const tomorrow = resetInstantNear(new Date(today.getTime() + 24 * 60 * 60_000));
	for (const reset of [today, tomorrow]) {
		const start = reset.getTime() - budgetMs;
		const end = reset.getTime() + SETTLE_MS;
		if (now.getTime() >= start && now.getTime() < end) return end - now.getTime();
	}
	return 0;
}

async function main() {
	const wait = resetWaitMs(
		new Date(),
		process.argv.includes('--shard') ? SHARD_BUDGET_MS : RUN_BUDGET_MS
	);
	if (wait === 0) {
		console.log('[mini-reset] clear of the nightly reset');
		return;
	}
	console.log(
		`[mini-reset] waiting ${Math.ceil(wait / 60_000)} min for the 03:17 Europe/Madrid reset to finish`
	);
	await sleep(wait);
	console.log('[mini-reset] done');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main();
}
