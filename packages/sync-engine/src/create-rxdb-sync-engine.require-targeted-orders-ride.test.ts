import { expect, it } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { createEngineHarness, type EngineHarnessRequest, remoteId } from './testing';

setPremiumFlag();

const includeIds = ({ url }: EngineHarnessRequest) =>
	new URL(url).searchParams.get('include')?.split(',') ?? [];

it("an orders browse declared after a released targeted walk does not drain the walk's leftover tasks", async () => {
	const remoteIds = Array.from({ length: 201 }, (_, index) => remoteId(index + 1));
	const firstInclude = Promise.withResolvers<string[]>();
	const gate = Promise.withResolvers<void>();
	const harness = await createEngineHarness({
		routes: {
			'/orders': async (request: EngineHarnessRequest) => {
				const ids = includeIds(request);
				if (!ids.length) return [];
				firstInclude.resolve(ids);
				await gate.promise;
				return ids.map((id) => ({
					id: Number(id),
					status: 'processing',
					date_modified_gmt: '2026-07-10T00:00:01',
					meta_data: [
						{
							key: '_woocommerce_pos_uuid',
							value: `77777777-7777-4777-8777-${id.padStart(12, '0')}`,
						},
					],
				}));
			},
		},
	});
	try {
		const { engine } = harness;
		const walk = engine.require({
			id: 'targeted-orders',
			collection: 'orders',
			kind: 'targeted-records',
			remoteIds,
		});
		const firstIds = await firstInclude.promise;
		walk.release();
		gate.resolve();
		const beforeBrowse = harness.requests.length;
		const browse = engine.require({
			id: 'orders-after-targeted',
			collection: 'orders',
			kind: 'orders-browse',
			status: 'processing',
			limit: 25,
		});
		await browse.ready;
		browse.release();
		expect(harness.requests.slice(beforeBrowse).flatMap(includeIds)).toHaveLength(0);

		const beforeMaintenance = harness.requests.length;
		await engine.sync('scheduler-drain');
		const fetched = harness.requests.slice(beforeMaintenance).flatMap(includeIds);
		const leftovers = remoteIds.filter((id) => !firstIds.includes(id));
		expect(fetched).toEqual(expect.arrayContaining(leftovers));
	} finally {
		gate.resolve();
		await harness.dispose();
	}
}, 30_000);
