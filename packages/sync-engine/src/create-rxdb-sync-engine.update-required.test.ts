/**
 * The protocol-gate latch (wcpos/woocommerce-pos#1752): when the server answers
 * a sync request with the deliberate `wcpos_update_required` refusal, the
 * transport tells the host exactly once, latches shut for the engine's
 * lifetime, and replays the refusal locally for every later request — a
 * blocked till must never hammer the store it can no longer talk to.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { createRxdbSyncEngine } from './create-rxdb-sync-engine';
import { memoryEngineStorage } from './testing';

setPremiumFlag();

const SITE = 'https://gate.example.test';
const SYNC_BASE = `${SITE}/wp-json/wcpos/v2`;
let uniqueStore = 0;

const REFUSAL = {
	code: 'wcpos_update_required',
	message: 'This store requires a newer version of WCPOS.',
	data: { status: 426, min_protocol: 2, server_protocol: 2, plugin_version: '1.11.0' },
};

async function buildEngine(scripted: Map<string, Response>) {
	uniqueStore += 1;
	// Scripted per-route; anything else (engine boot traffic) gets a benign
	// empty page, so the tests assert on the routes they drive, not on the
	// engine's incidental request count.
	const fetch = vi.fn(async (url: string) => {
		for (const [needle, response] of scripted) {
			if (url.includes(needle)) {
				scripted.delete(needle);
				return response;
			}
		}
		return new Response(JSON.stringify([]), {
			status: 200,
			headers: { 'content-type': 'application/json' },
		});
	});
	const onUpdateRequired = vi.fn();
	const engine = createRxdbSyncEngine(
		{
			site: { syncBaseUrl: SYNC_BASE, wpJsonRoot: `${SITE}/wp-json` },
			storage: memoryEngineStorage(),
			mode: 'manual',
			fetcher: fetch,
			onUpdateRequired,
		},
		{ site: SITE, storeId: 1, cashierId: `gate-${uniqueStore}` }
	);
	await engine.ready;
	return { engine, fetch, onUpdateRequired };
}

const jsonResponse = (body: unknown, status: number) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' },
	});

afterEach(() => {
	vi.restoreAllMocks();
});

const callsTo = (fetch: ReturnType<typeof vi.fn>, needle: string) =>
	fetch.mock.calls.filter(([url]) => typeof url === 'string' && url.includes(needle)).length;

describe('update-required latch', () => {
	it('latches on the refusal, tells the host once, and replays locally', async () => {
		const { engine, fetch, onUpdateRequired } = await buildEngine(
			new Map([['/changes/tick', jsonResponse(REFUSAL, 426)]])
		);

		const first = await engine.hostTransport().fetcher(`${SYNC_BASE}/changes/tick`);
		expect(first.status).toBe(426);
		expect(onUpdateRequired).toHaveBeenCalledTimes(1);
		expect(onUpdateRequired).toHaveBeenCalledWith({
			minProtocol: 2,
			serverProtocol: 2,
			pluginVersion: '1.11.0',
			status: 426,
		});

		// The latch replays the refusal without touching the network, for every
		// lane and every route.
		const second = await engine.hostTransport().fetcher(`${SYNC_BASE}/products`);
		expect(second.status).toBe(426);
		await expect(second.json()).resolves.toMatchObject({ code: 'wcpos_update_required' });
		expect(callsTo(fetch, '/products')).toBe(0);
		expect(onUpdateRequired).toHaveBeenCalledTimes(1);

		await engine.dispose();
	});

	it('recognizes the refusal by body code even when a middlebox rewrote the status', async () => {
		const { engine, fetch, onUpdateRequired } = await buildEngine(
			new Map([['/changes/tick', jsonResponse({ code: 'wcpos_update_required' }, 403)]])
		);

		await engine.hostTransport().fetcher(`${SYNC_BASE}/changes/tick`);
		expect(onUpdateRequired).toHaveBeenCalledWith({ status: 403 });

		const replay = await engine.hostTransport().fetcher(`${SYNC_BASE}/products`);
		expect(replay.status).toBe(403);
		expect(callsTo(fetch, '/products')).toBe(0);

		await engine.dispose();
	});

	it('never latches on other error bodies', async () => {
		const { engine, fetch, onUpdateRequired } = await buildEngine(
			new Map([
				['/changes/tick', jsonResponse({ code: 'rest_forbidden', data: { status: 403 } }, 403)],
			])
		);

		await engine.hostTransport().fetcher(`${SYNC_BASE}/changes/tick`);
		await engine.hostTransport().fetcher(`${SYNC_BASE}/changes/tick`);
		expect(onUpdateRequired).not.toHaveBeenCalled();
		// Both calls reached the network — nothing latched shut.
		expect(callsTo(fetch, '/changes/tick')).toBe(2);

		await engine.dispose();
	});
});
