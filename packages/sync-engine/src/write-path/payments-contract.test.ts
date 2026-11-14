import { expect, it } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { createFakeWriteServer, ORDER_MONEY_ORACLE } from '@wcpos/sync-core/testing';

import { createEngineHarness } from '../testing';
import { queueFor } from './write-intents';

setPremiumFlag();
const id = '9a9a9a9a-1111-4111-8111-aaaaaaaaaaaa';
const ENVELOPE_KEYS = [
	'baseRevision',
	'collection',
	'mutationId',
	'operation',
	'payload',
	'recordId',
].sort();

// ADR 0040: the server has no money epoch, and the store contract is no longer an
// engine input. A protocol-3 till that sent either key would be refused with
// 400 woo_rxdb_sync_bad_envelope on every order update.
it('no contract puts expectedEpoch or tillAggregate on the push envelope', async () => {
	const server = createFakeWriteServer();
	const sent: Record<string, unknown>[] = [];
	const { engine } = createEngineHarness({
		mode: 'manual',
		fetch: async (url, init) => {
			if (url.includes('/push/orders')) sent.push(JSON.parse(init!.body as string));
			return server.fetch(url, init as never);
		},
		awaitReady: false,
	});
	try {
		await engine.ready;
		const db = engine.active()!.database;
		const payload: Record<string, unknown> = {
			...structuredClone(ORDER_MONEY_ORACLE.pos),
			status: 'processing',
			meta_data: [
				{ key: '_woocommerce_pos_uuid', value: id },
				{ key: '_wcpos_money_epoch', value: '2' },
			],
		};
		await db.collections.orders.insert({
			uuid: id,
			remoteId: null,
			remoteKey: 'null',
			posUserId: '',
			posStoreId: '',
			number: '',
			dateCreatedGmt: '2026-08-06T00:00:00',
			status: 'processing',
			total: payload.total,
			customerId: 0,
			payload,
			sync: { revision: '', partial: false, source: 'skeleton' },
			local: { dirty: false, pendingMutationIds: [] },
		});
		await engine.write({
			collection: 'orders',
			operation: 'create',
			recordId: id,
			payload,
			explicit: true,
		});
		await engine.sync('write-drain');
		const resident = await db.collections.orders.findOne(id).exec();
		await engine.write({
			collection: 'orders',
			operation: 'update',
			recordId: id,
			payload: resident!.toJSON().payload,
			explicit: true,
		});
		expect((await queueFor(db).pending())[0]).not.toHaveProperty('expectedEpoch');
		await engine.sync('write-drain');
		expect(sent).toHaveLength(2);
		for (const envelope of sent) {
			expect(Object.keys(envelope).sort()).toEqual(ENVELOPE_KEYS);
		}
	} finally {
		await engine.dispose();
	}
});
