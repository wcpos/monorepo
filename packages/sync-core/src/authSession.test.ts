import { describe, expect, it, vi } from 'vitest';

import {
	AuthForbiddenError,
	AuthRefreshExhaustedError,
	classifyAuthStatus,
	createAuthSession,
	createRefreshGate,
} from './authSession';

describe('classifyAuthStatus', () => {
	// Regression (1.9.x bug dbd912750, catalog row 14): a 403 was treated as an auth
	// failure and drove a refresh loop until the token corrupted. ONLY 401 refreshes;
	// 403 is a permission error that must surface.
	it('maps 401 to refresh-required', () => {
		expect(classifyAuthStatus(401)).toBe('refresh-required');
	});

	it('maps 403 to forbidden — never refresh', () => {
		expect(classifyAuthStatus(403)).toBe('forbidden');
	});

	it('treats every other status (2xx, 429, 5xx) as authorized (not an auth failure)', () => {
		for (const status of [200, 201, 204, 400, 404, 429, 500, 502]) {
			expect(classifyAuthStatus(status)).toBe('authorized');
		}
	});
});

describe('createRefreshGate', () => {
	// Regression (catalog row 16): concurrent 401s must coalesce to ONE refresh, not
	// a stampede of N parallel token refreshes.
	it('coalesces concurrent calls into a single underlying refresh, resolving to one generation', async () => {
		let resolveRefresh: () => void = () => {};
		const underlying = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					resolveRefresh = resolve;
				})
		);
		const gate = createRefreshGate(underlying);

		expect(gate.generation()).toBe(0);
		const a = gate.refresh();
		const b = gate.refresh();
		const c = gate.refresh();
		expect(underlying).toHaveBeenCalledTimes(1);

		resolveRefresh();
		expect(await Promise.all([a, b, c])).toEqual([1, 1, 1]);
		expect(gate.generation()).toBe(1);
		expect(underlying).toHaveBeenCalledTimes(1);
	});

	it('starts a fresh refresh once the in-flight one settles, advancing the generation', async () => {
		const underlying = vi.fn(async () => {});
		const gate = createRefreshGate(underlying);

		expect(await gate.refresh()).toBe(1);
		expect(await gate.refresh()).toBe(2);

		expect(underlying).toHaveBeenCalledTimes(2);
		expect(gate.generation()).toBe(2);
	});

	it('rejects all coalesced callers when the underlying refresh fails, then clears the slot', async () => {
		const underlying = vi
			.fn()
			.mockRejectedValueOnce(new Error('refresh failed'))
			.mockResolvedValueOnce(undefined);
		const gate = createRefreshGate(underlying);

		const a = gate.refresh();
		const b = gate.refresh();
		await expect(a).rejects.toThrow('refresh failed');
		await expect(b).rejects.toThrow('refresh failed');
		expect(underlying).toHaveBeenCalledTimes(1);
		expect(gate.generation()).toBe(0); // a failed refresh does not advance the generation

		// Slot cleared after the failure — a later call retries rather than replaying the rejection.
		expect(await gate.refresh()).toBe(1);
		expect(underlying).toHaveBeenCalledTimes(2);
	});
});

describe('createAuthSession', () => {
	function ok<R>(result: R) {
		return { status: 200, result };
	}

	it('returns the response without refreshing when the request is authorized', async () => {
		const refreshToken = vi.fn(async () => {});
		const session = createAuthSession({ refreshToken });
		const perform = vi.fn(async () => ok('payload'));

		const attempt = await session.run(perform);

		expect(attempt).toEqual({ status: 200, result: 'payload' });
		expect(perform).toHaveBeenCalledTimes(1);
		expect(refreshToken).not.toHaveBeenCalled();
	});

	it('refreshes once on a 401 then retries and returns the fresh response', async () => {
		const refreshToken = vi.fn(async () => {});
		const session = createAuthSession({ refreshToken });
		const perform = vi
			.fn()
			.mockResolvedValueOnce({ status: 401, result: null })
			.mockResolvedValueOnce(ok('fresh'));

		const attempt = await session.run(perform);

		expect(attempt).toEqual({ status: 200, result: 'fresh' });
		expect(perform).toHaveBeenCalledTimes(2);
		expect(refreshToken).toHaveBeenCalledTimes(1);
	});

	it('surfaces a 403 immediately and NEVER refreshes (row 14 — no refresh loop on 403)', async () => {
		const refreshToken = vi.fn(async () => {});
		const session = createAuthSession({ refreshToken });
		const perform = vi.fn(async () => ({ status: 403, result: null }));

		await expect(session.run(perform)).rejects.toBeInstanceOf(AuthForbiddenError);
		expect(perform).toHaveBeenCalledTimes(1);
		expect(refreshToken).not.toHaveBeenCalled();
	});

	it('bounds refreshes and throws instead of looping when 401 persists (no token-corrupting loop)', async () => {
		const refreshToken = vi.fn(async () => {});
		const session = createAuthSession({ refreshToken, maxRefreshAttempts: 1 });
		const perform = vi.fn(async () => ({ status: 401, result: null }));

		await expect(session.run(perform)).rejects.toBeInstanceOf(AuthRefreshExhaustedError);
		// One refresh, one retry — then give up rather than spin.
		expect(refreshToken).toHaveBeenCalledTimes(1);
		expect(perform).toHaveBeenCalledTimes(2);
	});

	it('coalesces a concurrent 401 stampede into ONE refresh (row 16)', async () => {
		const refreshToken = vi.fn(async () => {});
		const session = createAuthSession({ refreshToken });
		// Every lane 401s on its first attempt, then succeeds after the shared refresh.
		const makePerform = (label: string) => {
			let called = false;
			return vi.fn(async () => {
				if (!called) {
					called = true;
					return { status: 401, result: null };
				}
				return ok(label);
			});
		};

		const results = await Promise.all(
			['a', 'b', 'c', 'd', 'e'].map((label) => session.run(makePerform(label)))
		);

		expect(results.map((r) => r.result)).toEqual(['a', 'b', 'c', 'd', 'e']);
		// Five lanes, ONE token refresh — the stampede coalesced.
		expect(refreshToken).toHaveBeenCalledTimes(1);
	});

	it('does not re-refresh for a stale 401 that lands after a peer lane already refreshed (staggered stampede)', async () => {
		// The subtle case single-flight alone misses: lane B leaves with the old token
		// and returns 401 only AFTER lane A's refresh has settled and cleared. Without
		// the generation guard, B would start a second, redundant refresh.
		let releaseBFirstAttempt: () => void = () => {};
		const bFirstAttempt = new Promise<void>((resolve) => {
			releaseBFirstAttempt = resolve;
		});

		const refreshToken = vi.fn(async () => {});
		const session = createAuthSession({ refreshToken });

		let aCalls = 0;
		const laneA = session.run(async () =>
			aCalls++ === 0 ? { status: 401, result: null } : ok('A')
		);

		let bCalls = 0;
		const laneB = session.run(async () => {
			if (bCalls++ === 0) {
				await bFirstAttempt; // hold B's stale 401 until A has finished refreshing
				return { status: 401, result: null };
			}
			return ok('B');
		});

		// Lane A drives the one refresh to completion first.
		await expect(laneA).resolves.toEqual({ status: 200, result: 'A' });
		expect(refreshToken).toHaveBeenCalledTimes(1);

		// Now B's stale 401 lands — it must retry with A's already-refreshed token,
		// NOT trigger a second refresh.
		releaseBFirstAttempt();
		await expect(laneB).resolves.toEqual({ status: 200, result: 'B' });
		expect(refreshToken).toHaveBeenCalledTimes(1);
		expect(bCalls).toBe(2);
	});

	it('a persistent staggered 401 gives up after the shared refresh — no per-lane re-refresh', async () => {
		// Both lanes fail persistently. Lane A drives the one refresh; lane B, staggered,
		// benefits from (and counts) A's refresh, retries with the fresh-but-still-bad
		// token, and surfaces AuthRefreshExhaustedError WITHOUT driving a second refresh.
		let releaseBFirstAttempt: () => void = () => {};
		const bFirstAttempt = new Promise<void>((resolve) => {
			releaseBFirstAttempt = resolve;
		});

		const refreshToken = vi.fn(async () => {});
		const session = createAuthSession({ refreshToken, maxRefreshAttempts: 1 });

		const laneA = session.run(async () => ({ status: 401, result: null }));

		let bCalls = 0;
		const laneB = session.run(async () => {
			if (bCalls++ === 0) {
				await bFirstAttempt;
			}
			return { status: 401, result: null };
		});

		await expect(laneA).rejects.toBeInstanceOf(AuthRefreshExhaustedError);
		expect(refreshToken).toHaveBeenCalledTimes(1);

		releaseBFirstAttempt();
		await expect(laneB).rejects.toBeInstanceOf(AuthRefreshExhaustedError);
		// The shared refresh already proved the token unfixable — B does NOT re-refresh.
		expect(refreshToken).toHaveBeenCalledTimes(1);
		expect(bCalls).toBe(2);
	});
});
