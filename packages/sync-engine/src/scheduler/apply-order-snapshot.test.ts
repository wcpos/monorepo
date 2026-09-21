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

	it('stores REST receipt links as order data without transport fields', async () => {
		const { repository, upsertMany } = fakeRepository();
		const snapshot = orderPayload({
			_links: {
				receipt: [{ href: 'https://example.test/receipt/42' }],
				payment: [{ href: 'https://example.test/payment/42' }],
			},
			_embedded: { customer: [{ id: 7 }] },
		});

		await applyOrderSnapshot({ repository }, snapshot);

		const [documents] = upsertMany.mock.calls[0];
		const storedPayload = (documents[0] as { payload: Record<string, unknown> }).payload;
		expect(storedPayload).toHaveProperty('links.receipt.0.href', 'https://example.test/receipt/42');
		expect(storedPayload).not.toHaveProperty('_links');
		expect(storedPayload).not.toHaveProperty('_embedded');
		expect(snapshot).toHaveProperty('_links');
		expect(snapshot).toHaveProperty('_embedded');
	});

	it('keeps existing order links instead of replacing them with REST links', async () => {
		const { repository, upsertMany } = fakeRepository();
		const links = { receipt: [{ href: 'https://example.test/existing-receipt/42' }] };

		await applyOrderSnapshot(
			{ repository },
			orderPayload({
				links,
				_links: { receipt: [{ href: 'https://example.test/rest-receipt/42' }] },
			})
		);

		const [documents] = upsertMany.mock.calls[0];
		const storedPayload = (documents[0] as { payload: Record<string, unknown> }).payload;
		expect(storedPayload.links).toEqual(links);
		expect(storedPayload).not.toHaveProperty('_links');
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

	it.each([
		{ status: 'completed', removed: 1, outcome: 'applied' },
		{ status: 'completed', removed: 0, outcome: 'protected' },
		{ status: 'pos-open', removed: 1, outcome: 'protected' },
	])(
		'offers a settled document to the held-row discarder, never a pos-open one (removed=$removed → $outcome)',
		async ({ status, removed, outcome }) => {
			const { repository, upsertMany } = fakeRepository();
			const pending = new Set([UUID]);
			const discardHeldOpenCartRows = vi.fn(async () => {
				if (removed) pending.delete(UUID);
				return removed;
			});
			const datePaid = status === 'completed' ? '2026-09-01T10:02:00' : null;
			await expect(
				applyOrderSnapshot(
					{ repository, pendingMutationOrderIds: async () => pending, discardHeldOpenCartRows },
					orderPayload({ status, date_paid_gmt: datePaid })
				)
			).resolves.toBe(outcome);
			if (status === 'pos-open') {
				expect(discardHeldOpenCartRows).not.toHaveBeenCalled();
			} else {
				// The discarder receives what it needs to decide: the status and the payment stamp.
				// date_modified_gmt travels with the settlement so the
				// discarder can tell a re-pull of an adopted (or older) document from a newer one.
				expect(discardHeldOpenCartRows).toHaveBeenCalledExactlyOnceWith(UUID, {
					status,
					datePaid,
					dateModified: '2026-09-01T10:00:00',
				});
			}
			expect(upsertMany).toHaveBeenCalledTimes(outcome === 'applied' ? 1 : 0);
		}
	);

	it('re-reads the pending set after a discard attempt that removed nothing (a concurrent lane won)', async () => {
		const { repository, upsertMany } = fakeRepository();
		let reads = 0;
		const pendingMutationOrderIds = vi.fn(async () => {
			reads += 1;
			// First read: the row is still there. Second read (after the attempt): gone —
			// another lane adopting the same paid snapshot retired it in between.
			return reads === 1 ? new Set([UUID]) : new Set<string>();
		});
		const discardHeldOpenCartRows = vi.fn(async () => 0);
		await expect(
			applyOrderSnapshot(
				{ repository, pendingMutationOrderIds, discardHeldOpenCartRows },
				orderPayload({ date_paid_gmt: '2026-09-01T10:02:00' })
			)
		).resolves.toBe('applied');
		expect(pendingMutationOrderIds).toHaveBeenCalledTimes(2);
		expect(upsertMany).toHaveBeenCalledTimes(1);
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
