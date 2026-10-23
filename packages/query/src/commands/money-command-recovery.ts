import { firstValueFrom } from 'rxjs';

import { type Post, type RecoveredOrder, recoverMoneyCommands } from './money-command';
import {
	type MoneyCommandEntry,
	nextClaimExpiry,
	observeMoneyJournal,
	owedResend,
} from '../store-local/money-commands';

import type { QueryRuntime } from '../provider';
import type { StoreLocalDatabase } from '../reads/store-local';

/**
 * When the session runs the recovery again after a re-send that failed without a definitive
 * answer (a 429, a 5xx, no answer) while the till stays online (Codex 4333265115 on #2798). A
 * reconnect, a restart and Try again still re-send at once.
 */
export const RECOVERY_RETRY_DELAYS_MS: readonly number[] = [
	// A reconnect blip: a rate limit or a proxy restart is over in half a minute.
	30_000,
	// A store restart takes a minute or two.
	120_000,
	// A longer outage: repeated every ten minutes so a down store is not hammered, until a run
	// answers or the next session start re-sends at once.
	600_000,
];

/**
 * The store session's money command recovery (`recoverMoneyCommands`) and its schedule. The
 * session is asked for a run (`due`) if and only if the CURRENT journal holds, for the active
 * scope, a command it owes a re-send (`owedResend`: the ladder) or a live claim on a dispatched or
 * deferred command that will lapse (`nextClaimExpiry`: the lapse). The journal is read at schedule
 * time, never from a run's snapshot. The ladder advances only when a step's run executes and
 * resets only when a run leaves nothing owed. A suspended session neither posts nor fires `due`.
 * The store database is per credential, so only its own cashier's session re-sends a command.
 */
export function moneyCommandRecovery(input: {
	runtime: QueryRuntime;
	storeDB: StoreLocalDatabase;
	/** The session's HTTP client, read ONCE per run: a store or site switch swaps it (Codex 4344063828 on #2836). */
	client: () => { post: Post };
	online: () => boolean;
	/** A claim lapsed or a ladder step came due: the caller runs `recover` in its own run queue. */
	due: () => void;
}) {
	const { runtime, storeDB, online, due } = input;
	let suspended = false;
	// A command the recovery skipped because a live claim held it is tried again when that claim
	// lapses (a crashed process's claim survives it), not only at the next start or reconnect.
	let lapse: ReturnType<typeof setTimeout> | undefined;
	// The backoff re-run after an unanswered re-send (`RECOVERY_RETRY_DELAYS_MS`).
	let retry: ReturnType<typeof setTimeout> | undefined;
	// The armed step's deadline, kept across an effect re-run's suspend; `retries` counts the
	// re-runs that executed, so scheduling twice never advances the ladder (Codex 4344063834
	// on #2836).
	let retryAt: number | null = null;
	let retries = 0;
	let retryPending = false;
	let journalWatch: { unsubscribe: () => void } | undefined;
	/**
	 * The active scope owes a command a re-send. Read off the CURRENT journal, so a command that
	 * lost its answer while a run iterated its snapshot keeps its retry (Codex 4345589102 on #2836).
	 */
	const owed = (entries: readonly MoneyCommandEntry[]) => {
		const scope = runtime.engine?.active()?.scopeId ?? null;
		return entries.some((entry) => owedResend(entry, scope));
	};
	const armRetry = () => {
		if (retry !== undefined || !retryPending || suspended) return;
		const now = Date.now();
		retryAt ??=
			now + RECOVERY_RETRY_DELAYS_MS[Math.min(retries, RECOVERY_RETRY_DELAYS_MS.length - 1)];
		retry = setTimeout(
			() => {
				retry = undefined;
				retryAt = null;
				// Offline nothing can be sent; the reconnect hook re-runs recovery (Codex 4333265115
				// on #2798).
				if (!online()) return;
				retries += 1;
				due();
			},
			Math.max(0, retryAt - now)
		);
	};
	const recoverWhenClaimsLapse = async () => {
		const scope = runtime.engine?.active()?.scopeId ?? null;
		const expiry = await nextClaimExpiry(storeDB, scope).catch(() => null);
		if (lapse !== undefined) clearTimeout(lapse);
		lapse = undefined;
		if (expiry === null || suspended) return;
		lapse = setTimeout(() => due(), Math.max(0, expiry - Date.now()) + 1);
	};
	// A command whose answers are lost after this session's first recovery, while the till
	// stays online: no reconnect will come for it, and a pull may close its tender. Watching
	// the journal schedules its recovery: a sent command nobody holds arms the first backoff
	// step, a live claim its lapse. Another scope's command waits for that scope (Codex
	// 4333124076 on #2798).
	const watch = () => {
		journalWatch ??= observeMoneyJournal(storeDB).subscribe({
			next: (entries) => {
				if (suspended) return;
				if (owed(entries)) {
					retryPending = true;
					armRetry();
				}
				void recoverWhenClaimsLapse();
			},
			error: () => undefined,
		});
	};
	return {
		/** Re-send what the active scope owes, then re-arm from the current journal. Throws to the caller. */
		async recover(): Promise<readonly RecoveredOrder[]> {
			// Bound to this session (Codex 4344063828 on #2836): a store or site switch swaps the
			// client, and an old journal's command must not go out through the new store. Refused
			// once the session is suspended, a send stays journaled for its own session's recovery.
			const http = input.client();
			const recovered = await recoverMoneyCommands(runtime, storeDB, {
				post: (url, body) =>
					suspended
						? Promise.reject(new Error('money_command_session_stopped'))
						: http.post(url, body),
			});
			await recoverWhenClaimsLapse();
			retryPending =
				recovered.some(({ unanswered }) => unanswered) ||
				owed(await firstValueFrom(observeMoneyJournal(storeDB)));
			if (!retryPending) {
				retries = 0;
				retryAt = null;
				if (retry !== undefined) clearTimeout(retry);
				retry = undefined;
			}
			armRetry();
			return recovered;
		},
		/** Effect cleanup: timers and the watch end, posts refuse; the ladder position is kept (#2836). */
		suspend() {
			suspended = true;
			if (lapse !== undefined) clearTimeout(lapse);
			lapse = undefined;
			if (retry !== undefined) clearTimeout(retry);
			retry = undefined;
			journalWatch?.unsubscribe();
			journalWatch = undefined;
		},
		/**
		 * First mount and every same-session re-run: React re-runs effects on remount and HMR, so the
		 * watch and timers are re-armed and no interval goes unwatched (#2798 R9).
		 */
		resume() {
			suspended = false;
			watch();
			if (online()) {
				void recoverWhenClaimsLapse();
				armRetry();
			}
		},
	};
}
