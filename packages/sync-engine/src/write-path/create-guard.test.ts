/**
 * A create is refused for a record whose resident already carries a server id:
 * an earlier create was acknowledged, and a second one under a new mutation id
 * is a duplicate the server cannot dedupe.
 */
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';
import { describe, expect, it } from 'vitest';

import { withOrderColumns } from '@wcpos/sync-core';

import { materializeLocalOnly } from '../materialization/record-materialization';
import { createEngineHarness } from '../testing';

setPremiumFlag();

const UUID = '00000000-0000-4000-8000-000000000177';

describe('write(create) for a record the server already holds', () => {
	it('is refused, and nothing is queued', async () => {
		const harness = await createEngineHarness({ mode: 'manual' });
		try {
			const { storedDocument } = materializeLocalOnly({
				id: 177,
				status: 'processing',
				meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID }],
			} as never);
			await harness.collection('orders').insert(withOrderColumns(storedDocument) as never);
			expect((await harness.collection('orders').findOne(UUID).exec())?.toJSON()).toMatchObject({
				remoteId: expect.anything(),
			});

			await expect(
				harness.engine.write({
					collection: 'orders',
					operation: 'create',
					recordId: UUID,
					payload: { status: 'processing' },
				})
			).rejects.toThrow(/already has a server id/);
			expect(await harness.collection('mutations').find().exec()).toEqual([]);
		} finally {
			await harness.dispose();
		}
	});
});
