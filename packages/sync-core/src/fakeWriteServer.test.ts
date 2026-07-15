import { describe, expect, it } from 'vitest';

import responseFixtures from '../contracts/write-contract/fixtures/responses.json';
import validFixtures from '../contracts/write-contract/fixtures/valid-envelopes.json';
import { RECORD_UUID_META_KEY } from './recordIdentity';
import { createFakeWriteServer, type PushEnvelope } from './fakeWriteServer';
import { pushEndpointResolver, pushRecordMutation } from './recordPushAdapter';
import { buildCreateMutation, buildUpdateMutation } from './recordMutation';

let seq = 0;
const deps = {
	mintUuid: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
	now: () => `2026-07-01T00:00:${String(seq).padStart(2, '0')}.000Z`,
};
const resolve = pushEndpointResolver('https://shop.example/wp-json/wcpos/v2');
const push = (
	server: ReturnType<typeof createFakeWriteServer>,
	mutation: Parameters<typeof pushRecordMutation>[0]['mutation']
) => pushRecordMutation({ mutation, resolveEndpoint: resolve, fetcher: server.fetch });

describe('createFakeWriteServer (faithful write-contract harness)', () => {
	it('echoes the client uuid back and assigns a stable numeric id per record', async () => {
		seq = 0;
		const server = createFakeWriteServer({ firstId: 555 });
		const create = buildCreateMutation(
			{ collectionName: 'customers', payload: { email: 'a@b.c' } },
			deps
		);

		const created = await push(server, create);

		expect(created.outcome).toBe('created');
		expect(created.document?.id).toBe(555);
		expect(created.document?.meta_data?.[0]).toEqual({
			key: RECORD_UUID_META_KEY,
			value: create.recordId,
		});
		expect(typeof created.currentRevision).toBe('string');
		expect(server.applied.get(create.recordId)).toEqual({
			id: 555,
			revision: created.currentRevision,
		});

		// A later update of the SAME record (anchored on the returned revision) keeps the id, advances the revision.
		const update = buildUpdateMutation(
			{
				collectionName: 'customers',
				recordId: create.recordId,
				payload: { email: 'x@y.z' },
				baseRevision: created.currentRevision!,
			},
			deps
		);
		const updated = await push(server, update);
		expect(updated.document?.id).toBe(555);
		expect(updated.currentRevision).not.toBe(created.currentRevision);
	});

	it('assigns a fresh id per distinct record', async () => {
		seq = 0;
		const server = createFakeWriteServer({ firstId: 10 });
		const a = await push(
			server,
			buildCreateMutation({ collectionName: 'orders', payload: {} }, deps)
		);
		const b = await push(
			server,
			buildCreateMutation({ collectionName: 'orders', payload: {} }, deps)
		);
		expect(a.document?.id).toBe(10);
		expect(b.document?.id).toBe(11);
	});

	it('is idempotent on a replayed mutationId — same response, no new id', async () => {
		seq = 0;
		const server = createFakeWriteServer({ firstId: 700 });
		const create = buildCreateMutation({ collectionName: 'orders', payload: {} }, deps);

		const first = await push(server, create);
		const replay = await push(server, create); // same mutationId

		expect(replay.document?.id).toBe(first.document?.id);
		expect(replay.currentRevision).toBe(first.currentRevision);
		expect(server.received).toHaveLength(2); // both requests seen
		expect([...server.applied.keys()]).toHaveLength(1); // but only one record applied
	});

	it('deliberately returns 201 for a memoized create replay (#526)', async () => {
		const server = createFakeWriteServer();
		const create = buildCreateMutation({ collectionName: 'orders', payload: {} }, deps);
		const url = 'https://example.test/wp-json/wcpos/v2/push/orders';
		const init = {
			method: 'POST',
			body: JSON.stringify({ ...create, collection: create.collectionName }),
		};
		expect((await server.fetch(url, init)).status).toBe(201);
		expect((await server.fetch(url, init)).status).toBe(201);
	});

	it('memoizes the original 200 verdict for a born-twice create replay', async () => {
		const server = createFakeWriteServer();
		const create = buildCreateMutation({ collectionName: 'orders', payload: {} }, deps);
		server.seed(create.recordId, { id: 42, revision: 'sha256:existing' });
		const url = 'https://example.test/wp-json/wcpos/v2/push/orders';
		const init = {
			method: 'POST',
			body: JSON.stringify({ ...create, collection: create.collectionName }),
		};
		expect((await server.fetch(url, init)).status).toBe(200);
		expect((await server.fetch(url, init)).status).toBe(200);
	});

	it('404s an update to a record the server does not know', async () => {
		seq = 0;
		const server = createFakeWriteServer();
		const update = buildUpdateMutation(
			{
				collectionName: 'products',
				recordId: '5b8e1a3c-2f4d-4a6b-9c8e-1d2f3a4b5c6d',
				payload: {},
				baseRevision: 'sha256:whatever',
			},
			deps
		);
		await expect(push(server, update)).rejects.toMatchObject({ status: 404 });
	});

	it('409s an update whose baseRevision is stale, and succeeds once seeded with the matching revision', async () => {
		seq = 0;
		const server = createFakeWriteServer();
		server.seed('uuid-seeded', { id: 42, revision: 'sha256:current' });

		const stale = buildUpdateMutation(
			{
				collectionName: 'orders',
				recordId: 'uuid-seeded',
				payload: {},
				baseRevision: 'sha256:stale',
			},
			deps
		);
		const conflict = await push(server, stale);
		expect(conflict.outcome).toBe('conflict');
		expect(conflict.conflict?.currentRevision).toBe('sha256:current');

		const fresh = buildUpdateMutation(
			{
				collectionName: 'orders',
				recordId: 'uuid-seeded',
				payload: {},
				baseRevision: 'sha256:current',
			},
			deps
		);
		const updated = await push(server, fresh);
		expect(updated.outcome).toBe('updated');
		expect(updated.document?.id).toBe(42);
	});

	it('400s a doubled-namespace URL — the endpoint guard is real (URL is validated, not just the body)', async () => {
		seq = 0;
		const server = createFakeWriteServer();
		// A caller-supplied sync base that already repeats the namespace must still be rejected.
		const doubledResolve = pushEndpointResolver('https://shop.example/wp-json/wcpos/v2/wcpos/v2');
		const create = buildCreateMutation({ collectionName: 'orders', payload: {} }, deps);

		await expect(
			pushRecordMutation({
				mutation: create,
				resolveEndpoint: doubledResolve,
				fetcher: server.fetch,
			})
		).rejects.toMatchObject({ status: 400 });
		expect(server.receivedUrls[0]).toContain('/wcpos/v2/wcpos/v2/push/orders');
	});

	it('scripts a 409 conflict surfaced by the push adapter', async () => {
		seq = 0;
		const server = createFakeWriteServer();
		server.seed('5b8e1a3c-2f4d-4a6b-9c8e-1d2f3a4b5c6d', { id: 1, revision: 'sha256:mine' });
		server.script((env: PushEnvelope) =>
			env.operation === 'update'
				? { kind: 'conflict', currentRevision: 'sha256:theirs' }
				: undefined
		);
		const update = buildUpdateMutation(
			{
				collectionName: 'products',
				recordId: '5b8e1a3c-2f4d-4a6b-9c8e-1d2f3a4b5c6d',
				payload: { regular_price: '9' },
				baseRevision: 'sha256:mine',
			},
			deps
		);

		const result = await push(server, update);

		expect(result.outcome).toBe('conflict');
		expect(result.conflict?.currentRevision).toBe('sha256:theirs');
	});

	it('scripts a transient 409 record_locked as a retryable throw (not a conflict)', async () => {
		seq = 0;
		const server = createFakeWriteServer();
		server.script(() => ({ kind: 'record_locked' }));
		const create = buildCreateMutation({ collectionName: 'orders', payload: {} }, deps);

		await expect(push(server, create)).rejects.toMatchObject({ status: 409 });
	});

	it('scripts a 409 identity_ambiguous in the real WP_Error byte-shape (F4a fail-closed)', async () => {
		seq = 0;
		const server = createFakeWriteServer();
		server.seed('uuid-dup', { id: 42, revision: 'sha256:current' });
		server.script(() => ({ kind: 'identity_ambiguous' }));

		// The raw response mirrors WP's WP_Error serialization from `unique_id_or_ambiguous`
		// (class-mutation-store.php): { code, message, data: { status: 409 } } — no `current`.
		const raw = await server.fetch('https://shop.example/wp-json/wcpos/v2/push/products', {
			method: 'POST',
			body: JSON.stringify({
				mutationId: 'm-amb',
				operation: 'update',
				collection: 'products',
				recordId: 'uuid-dup',
				baseRevision: 'sha256:current',
				payload: {},
			}),
		});
		expect(raw.status).toBe(409);
		expect(await raw.json()).toEqual({
			code: 'woo_rxdb_sync_identity_ambiguous',
			message:
				'uuid uuid-dup resolves to more than one record; refusing to write to an arbitrary match.',
			data: { status: 409 },
		});
	});

	it('scripted identity_ambiguous is classified PERMANENT by the push adapter (dead-letter, not conflict/retry)', async () => {
		seq = 0;
		const server = createFakeWriteServer();
		server.seed('5b8e1a3c-2f4d-4a6b-9c8e-1d2f3a4b5c6d', { id: 1, revision: 'sha256:mine' });
		server.script(() => ({ kind: 'identity_ambiguous' }));
		const update = buildUpdateMutation(
			{
				collectionName: 'products',
				recordId: '5b8e1a3c-2f4d-4a6b-9c8e-1d2f3a4b5c6d',
				payload: { regular_price: '9' },
				baseRevision: 'sha256:mine',
			},
			deps
		);

		await expect(push(server, update)).rejects.toMatchObject({
			status: 409,
			reason: 'identity-ambiguous',
			permanent: true,
		});
	});

	it('scripts a 428 precondition_required on a delete as a thrown retryable 428 (routes to the drain refresh recovery — #516 item 4)', async () => {
		seq = 0;
		const server = createFakeWriteServer();
		server.script(() => ({ kind: 'precondition_required' }));
		const del = {
			mutationId: 'm-del',
			operation: 'delete' as const,
			collectionName: 'orders',
			recordId: 'uuid-del',
			origin: 'existing' as const,
			payload: { id: 'uuid-del' },
			baseRevision: 'sha256:base',
			queuedAt: '2026-07-01T00:00:00.000Z',
		};

		// NOT a conflict result: the old null-truth conflict mapping bypassed the
		// drain's refreshRevision recovery and parked an unresolvable row. The
		// adapter throws a retryable 428 so deletes recover exactly like updates.
		await expect(push(server, del)).rejects.toMatchObject({
			status: 428,
			permanent: false,
			reason: 'woo_rxdb_sync_precondition_required',
		});
	});

	it('serves the canonical variation create and parent failure fixtures', async () => {
		const server = createFakeWriteServer();
		const create = validFixtures.find(({ name }) => name === 'variation-create-with-parent')!;
		const createdResponse = await server.fetch(
			'https://shop.example/wp-json/wcpos/v2/push/variations',
			{ method: 'POST', body: JSON.stringify(create.envelope) }
		);
		expect(createdResponse.status).toBe(201);

		const missingParent = validFixtures.find(
			({ name }) => name === 'variation-parent-precondition-428'
		)!;
		const expectedMissingParent = responseFixtures.find(
			({ name }) => name === 'variation-parent-precondition-428'
		)!;
		const missingResponse = await server.fetch(
			'https://shop.example/wp-json/wcpos/v2/push/variations',
			{ method: 'POST', body: JSON.stringify(missingParent.envelope) }
		);
		expect(missingResponse.status).toBe(expectedMissingParent.status);
		expect(await missingResponse.json()).toEqual(expectedMissingParent.body);

		const mismatch = validFixtures.find(({ name }) => name === 'variation-parent-mismatch-409')!;
		const expectedMismatch = responseFixtures.find(
			({ name }) => name === 'variation-parent-mismatch-409'
		)!;
		server.seed(mismatch.envelope.recordId, {
			id: 77,
			revision: mismatch.envelope.baseRevision!,
			collection: 'variations',
			payload: { parent_id: 100 },
		});
		const mismatchResponse = await server.fetch(
			'https://shop.example/wp-json/wcpos/v2/push/variations',
			{ method: 'POST', body: JSON.stringify(mismatch.envelope) }
		);
		expect(mismatchResponse.status).toBe(expectedMismatch.status);
		expect(await mismatchResponse.json()).toEqual(expectedMismatch.body);
	});

	describe('ADR 0011 header mirror (faithful to Header_Mirror::assert)', () => {
		const envelope = (over: Partial<PushEnvelope> = {}): string =>
			JSON.stringify({
				mutationId: 'm-1',
				operation: 'create',
				collection: 'orders',
				recordId: 'uuid-m1',
				baseRevision: null,
				payload: {},
				...over,
			});
		const url = 'https://shop.example/wp-json/wcpos/v2/push/orders';

		it('422s when Idempotency-Key disagrees with the body mutationId', async () => {
			const server = createFakeWriteServer();
			const response = await server.fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'SOMETHING-ELSE' },
				body: envelope(),
			});
			expect(response.status).toBe(422);
			expect(((await response.json()) as { code: string }).code).toBe(
				'woo_rxdb_sync_header_body_mismatch'
			);
		});

		it('422s when If-Match disagrees with the body baseRevision', async () => {
			const server = createFakeWriteServer();
			server.seed('uuid-m1', { id: 9, revision: 'sha256:current' });
			const response = await server.fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Idempotency-Key': 'm-1',
					'If-Match': '"sha256:other"',
				},
				body: envelope({ operation: 'update', baseRevision: 'sha256:current' }),
			});
			expect(response.status).toBe(422);
		});

		it('accepts a quoted If-Match entity-tag and a W/-weakened one when the bare revision matches', async () => {
			const server = createFakeWriteServer();
			server.seed('uuid-m1', { id: 9, revision: 'sha256:current' });
			const quoted = await server.fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Idempotency-Key': 'm-1',
					'If-Match': '"sha256:current"',
				},
				body: envelope({ operation: 'update', baseRevision: 'sha256:current' }),
			});
			expect(quoted.status).toBe(200);

			const weakened = await server.fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Idempotency-Key': 'm-2',
					'If-Match': 'W/"sha256:r2"',
				},
				body: envelope({ mutationId: 'm-2', operation: 'update', baseRevision: 'sha256:r2' }),
			});
			// the first update advanced the stored revision; only the mirror agreement matters here
			expect(weakened.status).not.toBe(422);
		});

		it('absent mirror headers are fine — the body stays canonical', async () => {
			const server = createFakeWriteServer();
			const response = await server.fetch(url, { method: 'POST', body: envelope() });
			expect(response.status).toBe(201);
		});

		it('the client push adapter sends the mirror headers the fake server cross-checks (regression tripwire)', async () => {
			seq = 0;
			const server = createFakeWriteServer();
			const seenHeaders: Record<string, string>[] = [];
			const fetcher = async (requestUrl: string, init?: RequestInit): Promise<Response> => {
				seenHeaders.push(init?.headers as Record<string, string>);
				return server.fetch(requestUrl, init);
			};
			const pushWithHeaderTripwire = (
				mutation: Parameters<typeof pushRecordMutation>[0]['mutation']
			) => pushRecordMutation({ mutation, resolveEndpoint: resolve, fetcher });

			const create = buildCreateMutation({ collectionName: 'orders', payload: {} }, deps);
			const created = await pushWithHeaderTripwire(create);
			expect(created.outcome).toBe('created');
			expect(seenHeaders[0]['Idempotency-Key']).toBe(create.mutationId);
			expect(seenHeaders[0]['If-Match']).toBeUndefined();

			const update = buildUpdateMutation(
				{
					collectionName: 'orders',
					recordId: create.recordId,
					payload: {},
					baseRevision: created.currentRevision!,
				},
				deps
			);
			const updated = await pushWithHeaderTripwire(update);
			expect(updated.outcome).toBe('updated');
			expect(seenHeaders[1]['Idempotency-Key']).toBe(update.mutationId);
			expect(seenHeaders[1]['If-Match']).toBe(`"${created.currentRevision}"`);
		});
	});
});
