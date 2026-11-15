import { waitFor } from '@testing-library/react';
import { BehaviorSubject, filter, firstValueFrom } from 'rxjs';

import { remoteIdOrNull, remoteKeyFor } from '@wcpos/sync-core';

import { acquireOrderRefundsQueryHandle } from '../../src/order-refunds';
import { canonicalQueryKey } from '../../src/query-state';
import { observeSessionAccounting } from '../../src/register-session/reads';
import { createEngineDatabase, createFakeEngine, engineOrder } from '../../src/testing';

it('a stored refund of another store reaches no till reader', async () => {
	const database = await createEngineDatabase(['refunds', 'orders']);
	const engine = createFakeEngine(database);
	const releases: (() => void)[] = [];
	try {
		await database.collections.orders.insert(
			engineOrder({ uuid: 'order-1', id: 1, date_modified_gmt: '2026-10-28T12:00:00' })
		);
		await database.collections.refunds.bulkInsert([
			{
				uuid: 'refund-20',
				remoteId: remoteIdOrNull(20),
				remoteKey: remoteKeyFor(remoteIdOrNull(20)),
				sessionId: 'us',
				payload: {
					id: 20,
					parent_id: 1,
					amount: '5',
					date_created_gmt: '2026-10-28T15:00:00',
					meta_data: [
						{ key: '_wcpos_session', value: 'us' },
						{ key: '_pos_store', value: '1' },
					],
				},
				sync: { revision: '1', partial: false, source: 'woo-rest' },
				local: { dirty: false, pendingMutationIds: [] },
			},
			{
				uuid: 'refund-30',
				remoteId: remoteIdOrNull(30),
				remoteKey: remoteKeyFor(remoteIdOrNull(30)),
				sessionId: 'uk',
				payload: {
					id: 30,
					parent_id: 99,
					amount: '9',
					date_created_gmt: '2026-10-28T15:30:00',
					meta_data: [
						{ key: '_wcpos_session', value: 'uk' },
						{ key: '_pos_store', value: '2' },
						{ key: '_pos_user', value: '7' },
					],
				},
				sync: { revision: '1', partial: false, source: 'woo-rest' },
				local: { dirty: false, pendingMutationIds: [] },
			},
		]);
		const accounting = await firstValueFrom(
			observeSessionAccounting(
				engine as never,
				new BehaviorSubject({ id: 'us', opened_at_gmt: '2026-10-28T00:00:00' }) as never
			).pipe(filter((value) => value !== null))
		);
		expect(accounting.refundSources.map(({ uuid }) => uuid)).toEqual(['refund-20']);
		expect(accounting.refundRecords.map(({ id }) => id)).toEqual([20]);
		const key = canonicalQueryKey(['refunds-by-parent', 0, 0, 1]);
		const handle = acquireOrderRefundsQueryHandle(engine, key, 1);
		releases.push(handle.retain());
		await waitFor(() =>
			expect(handle.value.result.hits.map(({ record }) => record.uuid)).toEqual(['refund-20'])
		);
	} finally {
		for (const release of releases) release();
		await Promise.resolve();
		await database.remove();
	}
});
