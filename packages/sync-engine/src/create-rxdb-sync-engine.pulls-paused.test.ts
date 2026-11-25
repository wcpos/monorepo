import { describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { createFakeWriteServer } from '@wcpos/sync-core/testing';

import { createEngineHarness } from './testing';

setPremiumFlag();

const ORDER_ID = '22222222-2222-4222-8222-222222222222';

describe('automatic pulls paused', () => {
	it.each(['interval', 'nudge'] as const)(
		'skips cold-start and timer pulls while a sale pushes via %s',
		async (trigger) => {
			const server = createFakeWriteServer();
			const harness = await createEngineHarness({
				mode: 'auto',
				captureTimers: true,
				ports: { pullsPaused: () => true },
				fetch: (url, init) => server.fetch(url, init as never),
			});
			const { engine, timers, requests, events, clock } = harness;
			try {
				await vi.waitFor(() => expect(timers!.intervals.length).toBeGreaterThan(0));
				// Scope activation still primes its head and hydrates barcode settings;
				// neither is an automatic lane tick. Cold-start seeds must all skip.
				expect(events.filter((event) => event.type === 'lane-finish')).toEqual(
					expect.arrayContaining([
						expect.objectContaining({ lane: 'reference-seed', status: 'skipped' }),
						expect.objectContaining({ lane: 'order-window-seed', status: 'skipped' }),
						expect.objectContaining({ lane: 'scheduler-drain', status: 'skipped' }),
					])
				);
				requests.length = 0;
				events.length = 0;
				clock.advance(60_000);
				const changeTimer = timers!.timeouts.findIndex((timer) => timer.delayMs === 10_000);
				expect(changeTimer).toBeGreaterThanOrEqual(0);
				timers!.fireTimeout(changeTimer);
				for (let index = 0; index < timers!.intervals.length; index += 1) {
					timers!.fireInterval(index);
				}
				await vi.waitFor(() =>
					expect(events).toContainEqual(
						expect.objectContaining({ type: 'lane-finish', lane: 'write-drain' })
					)
				);
				const skipped = (lane: string) =>
					expect.objectContaining({ lane, status: 'skipped', detail: 'pulls-paused' });
				await vi.waitFor(() =>
					expect(events.filter((event) => event.type === 'lane-finish')).toEqual(
						expect.arrayContaining([skipped('change-signal'), skipped('scheduler-drain')])
					)
				);
				expect(requests).toEqual([]);

				await harness.seed('orders', [
					{
						posUserId: '',
						posStoreId: '',
						uuid: ORDER_ID,
						remoteId: null,
						remoteKey: '',
						number: '',
						dateCreatedGmt: '2026-07-10T00:00:00',
						status: 'pending',
						total: '0.00',
						customerId: 0,
						payload: {
							status: 'pending',
							meta_data: [{ key: '_woocommerce_pos_uuid', value: ORDER_ID }],
						},
						sync: { revision: '', partial: false, source: 'skeleton' },
						local: { dirty: false, pendingMutationIds: [] },
					},
				]);
				await engine.write({
					collection: 'orders',
					operation: 'create',
					recordId: ORDER_ID,
					payload: { status: 'pending' },
				});
				if (trigger === 'nudge') {
					clock.advance(300);
					timers!.fireTimeout(timers!.timeouts.findIndex((timer) => timer.delayMs === 300));
				} else {
					clock.advance(10_000);
					timers!.fireInterval(0);
				}
				await vi.waitFor(async () =>
					expect(await harness.collection('mutations').find().exec()).toHaveLength(0)
				);
				expect(
					server.received.filter((envelope) => envelope.mutationId !== undefined)
				).toHaveLength(1);
				expect(requests.some((request) => request.path.includes('/changes/'))).toBe(false);
				// Explicit manual sync remains available even while automatic pulls pause.
				await engine.sync('change-signal');
				expect(requests.some((request) => request.path.endsWith('/changes/tick'))).toBe(true);
			} finally {
				await harness.dispose();
			}
		}
	);
});
