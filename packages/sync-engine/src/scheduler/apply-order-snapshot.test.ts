import { describe, expect, it, vi } from 'vitest';

import { applyOrderSnapshot } from './rx-scheduler-order-fetcher';

import type { EngineOrderRepository } from '../write-path/engine-order-repository';

const UUID = '018f6f2a-0000-4000-8000-000000000042';

/** A checkout-received order payload: server-born, so it MUST carry its stamped uuid. */
function orderPayload(overrides: Record<string, unknown> = {}) {
	return {
		id: 42,
		status: 'completed',
		number: '42',
		date_modified_gmt: '2026-09-01T10:00:00',
		line_items: [],
		meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID }],
		...overrides,
	};
}

function fakeRepository(upserted: unknown[] | 'echo' = 'echo') {
	const upsertMany = vi.fn(async (documents: unknown[]) =>
		upserted === 'echo' ? documents : upserted
	);
	const upsertManifestRows = vi.fn(async () => undefined);
	return {
		repository: { upsertMany, upsertManifestRows } as unknown as EngineOrderRepository,
		upsertMany,
		upsertManifestRows,
	};
}

describe('applyOrderSnapshot', () => {
	it('rejects payloads that are not a plausible order snapshot, touching nothing', async () => {
		const { repository, upsertMany } = fakeRepository();
		for (const payload of [
			null,
			undefined,
			'completed',
			[orderPayload()],
			orderPayload({ id: '42' }), // string id — the encoded-WP_Error shape has none at all
			orderPayload({ id: 0 }),
			orderPayload({ status: '' }),
			{ code: 'rest_forbidden', message: 'x', data: { status: 403 } }, // encoded dispatch error
		]) {
			await expect(applyOrderSnapshot({ repository }, payload)).resolves.toBe('invalid');
		}
		expect(upsertMany).not.toHaveBeenCalled();
	});

	it('applies a valid snapshot through the repository under its stamped uuid', async () => {
		const { repository, upsertMany } = fakeRepository();
		await expect(applyOrderSnapshot({ repository }, orderPayload())).resolves.toBe('applied');
		expect(upsertMany).toHaveBeenCalledTimes(1);
		const [documents] = upsertMany.mock.calls[0];
		expect(documents).toHaveLength(1);
		const document = documents[0] as {
			uuid: string;
			remoteId: string | null;
			payload: { status: string };
			local: { dirty: boolean };
		};
		expect(document.uuid).toBe(UUID);
		expect(document.payload.status).toBe('completed');
		expect(document.local.dirty).toBe(false);
	});

	it('refuses to overwrite an order with queued local work (pending set)', async () => {
		const { repository, upsertMany } = fakeRepository();
		await expect(
			applyOrderSnapshot(
				{ repository, pendingMutationOrderIds: async () => new Set([UUID]) },
				orderPayload()
			)
		).resolves.toBe('protected');
		expect(upsertMany).not.toHaveBeenCalled();
	});

	it('reports protected when the storage guard drops the document', async () => {
		const { repository, upsertManifestRows } = fakeRepository([]);
		await expect(applyOrderSnapshot({ repository }, orderPayload())).resolves.toBe('protected');
		// Manifest rows follow what was APPLIED — a dropped document contributes nothing.
		expect(upsertManifestRows).not.toHaveBeenCalled();
	});

	it('rejects a snapshot with no stamped uuid instead of forking a divergent identity', async () => {
		const { repository, upsertMany } = fakeRepository();
		// mintOnMissing:false in the shared materialization — a server record without
		// its `_woocommerce_pos_uuid` meta throws; the caller falls back to a refetch.
		await expect(
			applyOrderSnapshot({ repository }, orderPayload({ meta_data: [] }))
		).rejects.toThrow();
		expect(upsertMany).not.toHaveBeenCalled();
	});
});
