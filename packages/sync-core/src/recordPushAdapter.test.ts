import { describe, expect, it, vi } from 'vitest';

import { RECORD_UUID_META_KEY } from './recordIdentity';
import { type SyncEvent } from './telemetry';
import {
	pushEndpointResolver,
	pushRecordMutation,
	reconcileCreateAck,
	RecordPushError,
} from './recordPushAdapter';

import type { RecordMutation } from './recordMutation';

const UUID = '5b8e1a3c-2f4d-4a6b-9c8e-1d2f3a4b5c6d';

const mut = (over: Partial<RecordMutation> = {}): RecordMutation => ({
	mutationId: 'm1',
	collectionName: 'products',
	operation: 'create',
	recordId: UUID,
	origin: 'minted',
	payload: { name: 'Widget', meta_data: [{ key: RECORD_UUID_META_KEY, value: UUID }] },
	baseRevision: null,
	queuedAt: '2026-06-26T00:00:00.000Z',
	...over,
});

const jsonResponse = (status: number, body: unknown): Response =>
	({ status, ok: status >= 200 && status < 300, json: async () => body }) as unknown as Response;

const resolveEndpoint = (m: RecordMutation) => ({
	url: `https://x/${m.collectionName}/${m.operation}`,
	method: 'POST',
});

describe('pushRecordMutation', () => {
	it.each([
		['sku', { sku: 'EDITED' }],
		['global_unique_id', { global_unique_id: 'EDITED' }],
		['meta_data:_barcode', { meta_data: [{ key: '_barcode', value: 'EDITED' }] }],
	] as const)(
		'maps a barcode edit to %s and never pushes the derived field',
		async (selector, expected) => {
			const fetcher = vi.fn(async (_url: string, _init?: RequestInit) =>
				jsonResponse(200, { id: 1 })
			);

			await pushRecordMutation({
				mutation: mut({ operation: 'update', payload: { barcode: 'EDITED' } }),
				resolveEndpoint,
				fetcher,
				barcodeSelectors: [selector],
			});

			const body = JSON.parse((fetcher.mock.calls[0][1] as RequestInit).body as string);
			expect(body.payload).toEqual(expected);
			expect(body.payload).not.toHaveProperty('barcode');
		}
	);

	it('derives the writable date_expires on a coupon push (wc/v3 drops date_expires_gmt)', async () => {
		const fetcher = vi.fn(async (_url: string, _init?: RequestInit) =>
			jsonResponse(200, { id: 1 })
		);

		await pushRecordMutation({
			mutation: mut({
				collectionName: 'coupons',
				payload: { code: 'dippy', date_expires_gmt: '2026-09-03T21:59:59' },
			}),
			resolveEndpoint,
			fetcher,
		});

		const body = JSON.parse((fetcher.mock.calls[0][1] as RequestInit).body as string);
		expect(body.payload.date_expires).toBe('2026-09-03T21:59:59Z');
		expect(body.payload.date_expires_gmt).toBe('2026-09-03T21:59:59');
	});

	it('creates: posts the payload, returns the server document + a created outcome, emits push.outcome', async () => {
		const events: SyncEvent[] = [];
		const fetcher = vi.fn(async (_url: string, _init?: RequestInit) =>
			jsonResponse(201, { id: 4242, meta_data: [{ key: RECORD_UUID_META_KEY, value: UUID }] })
		);
		const result = await pushRecordMutation({
			mutation: mut(),
			resolveEndpoint,
			fetcher,
			observe: (e) => events.push(e),
		});
		expect(result.outcome).toBe('created');
		expect(result.document).toEqual({
			id: 4242,
			meta_data: [{ key: RECORD_UUID_META_KEY, value: UUID }],
		});
		const [url, init] = fetcher.mock.calls[0];
		expect(url).toBe('https://x/products/create');
		// the full envelope is sent — the server needs the mutationId to dedupe retries
		expect(JSON.parse((init as RequestInit).body as string)).toEqual({
			mutationId: 'm1',
			operation: 'create',
			collection: 'products',
			recordId: UUID,
			baseRevision: null,
			payload: mut().payload,
		});
		expect(events.map((e) => e.type)).toEqual(['push.outcome']);
		expect(events[0].fields).toMatchObject({ op: 'create', outcome: 'created', recordId: UUID });
	});

	it('updates: outcome updated', async () => {
		const result = await pushRecordMutation({
			mutation: mut({ operation: 'update' }),
			resolveEndpoint,
			fetcher: async () => jsonResponse(200, { id: 1 }),
		});
		expect(result.outcome).toBe('updated');
	});

	it('deletes: sends the envelope without a payload and returns a null document', async () => {
		const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(200, {}));
		const result = await pushRecordMutation({
			mutation: mut({ operation: 'delete' }),
			resolveEndpoint,
			fetcher,
		});
		expect(result.outcome).toBe('deleted');
		expect(result.document).toBeNull();
		const body = JSON.parse((fetcher.mock.calls[0][1] as RequestInit).body as string);
		expect(body).toEqual({
			mutationId: 'm1',
			operation: 'delete',
			collection: 'products',
			recordId: UUID,
			baseRevision: null,
		});
		expect(body.payload).toBeUndefined(); // a delete carries no payload
	});

	it('deletes: refuses a 2xx whose body is not JSON (a host challenge page) as no-document', async () => {
		const events: SyncEvent[] = [];
		await expect(
			pushRecordMutation({
				mutation: mut({ operation: 'delete' }),
				resolveEndpoint,
				fetcher: async () =>
					new Response('<html><body>Checking your browser</body></html>', {
						status: 202,
						headers: { 'Content-Type': 'text/html' },
					}),
				observe: (e) => events.push(e),
			})
		).rejects.toMatchObject({ name: 'RecordPushError', status: 202, reason: 'no-document' });
		expect(events.filter((e) => e.type === 'push.error')).toHaveLength(1);
		expect(events.find((e) => e.type === 'push.error')).toMatchObject({
			level: 'error',
			fields: { status: 202, reason: 'no-document' },
		});
		expect(events.some((e) => e.type === 'push.outcome')).toBe(false);
	});

	it('deletes: refuses a 2xx JSON array as no-document', async () => {
		await expect(
			pushRecordMutation({
				mutation: mut({ operation: 'delete' }),
				resolveEndpoint,
				fetcher: async () => jsonResponse(200, []),
			})
		).rejects.toMatchObject({ reason: 'no-document', status: 200 });
	});

	it('deletes: acknowledges a 204 with no body', async () => {
		const result = await pushRecordMutation({
			mutation: mut({ operation: 'delete' }),
			resolveEndpoint,
			fetcher: async () => new Response(null, { status: 204 }),
		});
		expect(result.outcome).toBe('deleted');
		expect(result.document).toBeNull();
	});

	it('parses the { document, currentRevision } envelope into document + currentRevision', async () => {
		const result = await pushRecordMutation({
			mutation: mut(),
			resolveEndpoint,
			fetcher: async () =>
				jsonResponse(201, {
					document: { id: 9, meta_data: [{ key: RECORD_UUID_META_KEY, value: UUID }] },
					currentRevision: 'sha256:abc',
				}),
		});
		expect(result.document).toEqual({
			id: 9,
			meta_data: [{ key: RECORD_UUID_META_KEY, value: UUID }],
		});
		expect(result.currentRevision).toBe('sha256:abc'); // stored as the next update's baseRevision
	});

	it('accepts a bare record (no envelope) for back-compat, with a null revision', async () => {
		const result = await pushRecordMutation({
			mutation: mut(),
			resolveEndpoint,
			fetcher: async () => jsonResponse(201, { id: 1, meta_data: [] }),
		});
		expect(result.document).toEqual({ id: 1, meta_data: [] });
		expect(result.currentRevision).toBeNull();
	});

	it('does NOT mis-unwrap a bare record that carries its own top-level document field', async () => {
		const bare = { id: 2, document: 'a real woo field, not an envelope', meta_data: [] };
		const result = await pushRecordMutation({
			mutation: mut(),
			resolveEndpoint,
			fetcher: async () => jsonResponse(201, bare),
		});
		expect(result.document).toEqual(bare); // taken as-is (no currentRevision ⇒ not an envelope)
		expect(result.currentRevision).toBeNull();
	});

	it('unwraps an enveloped success response via extractDocument', async () => {
		const result = await pushRecordMutation({
			mutation: mut(),
			resolveEndpoint,
			fetcher: async () =>
				jsonResponse(201, {
					document: { id: 5, meta_data: [{ key: RECORD_UUID_META_KEY, value: UUID }] },
				}),
			extractDocument: (body) => (body.document as Record<string, unknown>) ?? null,
		});
		expect(result.document).toEqual({
			id: 5,
			meta_data: [{ key: RECORD_UUID_META_KEY, value: UUID }],
		});
	});

	it('409: returns a conflict outcome with the server current state, emits push.conflict (warn), does NOT throw', async () => {
		const events: SyncEvent[] = [];
		const result = await pushRecordMutation({
			mutation: mut({ operation: 'update' }),
			resolveEndpoint,
			fetcher: async () =>
				jsonResponse(409, { current: { id: 9, status: 'completed' }, currentRevision: 'rev-9' }),
			observe: (e) => events.push(e),
		});
		expect(result.outcome).toBe('conflict');
		expect(result.conflict).toEqual({
			current: { id: 9, status: 'completed' },
			currentRevision: 'rev-9',
		});
		expect(events[0].type).toBe('push.conflict');
		expect(events[0].level).toBe('warn');
	});

	it('treats a 409 in_progress (atomic-reserve contention) as a retryable error, not a conflict', async () => {
		const events: SyncEvent[] = [];
		await expect(
			pushRecordMutation({
				mutation: mut({ operation: 'update' }),
				resolveEndpoint,
				fetcher: async () =>
					jsonResponse(409, { code: 'woo_rxdb_sync_in_progress', message: 'retry' }),
				observe: (e) => events.push(e),
			})
		).rejects.toMatchObject({ name: 'RecordPushError', reason: 'in-progress', status: 409 });
		expect(events[0].type).toBe('push.in_progress');
	});

	it('treats a 409 record_locked (per-record CAS lock held) as a retryable error, not a conflict', async () => {
		const events: SyncEvent[] = [];
		await expect(
			pushRecordMutation({
				mutation: mut({ operation: 'update' }),
				resolveEndpoint,
				fetcher: async () =>
					jsonResponse(409, { code: 'woo_rxdb_sync_record_locked', message: 'retry shortly' }),
				observe: (e) => events.push(e),
			})
		).rejects.toMatchObject({ name: 'RecordPushError', reason: 'record-locked', status: 409 });
		expect(events[0].type).toBe('push.in_progress'); // transient, not push.conflict
	});

	it('treats a 409 identity_ambiguous (F4a fail-closed) as a PERMANENT error — not a conflict, not transient', async () => {
		const events: SyncEvent[] = [];
		// The real body is a WP_Error serialization ({ code, message, data.status }) — no `current` to rebase on.
		await expect(
			pushRecordMutation({
				mutation: mut({ operation: 'update' }),
				resolveEndpoint,
				fetcher: async () =>
					jsonResponse(409, {
						code: 'woo_rxdb_sync_identity_ambiguous',
						message: `uuid ${UUID} resolves to more than one post record; refusing to write to an arbitrary match.`,
						data: { status: 409 },
					}),
				observe: (e) => events.push(e),
			})
		).rejects.toMatchObject({
			name: 'RecordPushError',
			reason: 'identity-ambiguous',
			status: 409,
			permanent: true,
		});
		// surfaced as an ERROR (the host must see it), not push.conflict / push.in_progress
		expect(events.map((e) => e.type)).toEqual(['push.error']);
		expect(events[0]).toMatchObject({
			level: 'error',
			fields: { status: 409, reason: 'identity-ambiguous' },
		});
	});

	it('logs a 401 at warn, so the lane reports the refused session once', async () => {
		const events: SyncEvent[] = [];
		await expect(
			pushRecordMutation({
				mutation: mut({ operation: 'update' }),
				resolveEndpoint,
				fetcher: async () => jsonResponse(401, { code: 'woocommerce_pos_rest_unauthorized' }),
				observe: (e) => events.push(e),
			})
		).rejects.toMatchObject({
			name: 'RecordPushError',
			status: 401,
			reason: 'woocommerce_pos_rest_unauthorized',
		});
		expect(events.map((e) => e.type)).toEqual(['push.error']);
		expect(events[0]).toMatchObject({
			level: 'warn',
			fields: { status: 401, reason: 'woocommerce_pos_rest_unauthorized' },
		});
	});

	it('keeps the transient 409s non-permanent so only identity_ambiguous is dead-lettered', async () => {
		await expect(
			pushRecordMutation({
				mutation: mut({ operation: 'update' }),
				resolveEndpoint,
				fetcher: async () => jsonResponse(409, { code: 'woo_rxdb_sync_in_progress' }),
			})
		).rejects.toMatchObject({ permanent: false });
	});

	it('maps variation parent-mismatch 409 to the ordinary missing-revision conflict path', async () => {
		const result = await pushRecordMutation({
			mutation: mut({ collectionName: 'variations', operation: 'update' }),
			resolveEndpoint,
			fetcher: async () =>
				jsonResponse(409, {
					code: 'woo_rxdb_sync_parent_mismatch',
					message: 'invalid parent',
				}),
		});

		expect(result).toMatchObject({
			outcome: 'conflict',
			currentRevision: null,
			conflict: { current: null, currentRevision: null },
		});
	});

	it('keeps variation parent-required 428 non-permanent at the wire layer', async () => {
		await expect(
			pushRecordMutation({
				mutation: mut({ collectionName: 'variations', operation: 'create' }),
				resolveEndpoint,
				fetcher: async () =>
					jsonResponse(428, {
						code: 'woo_rxdb_sync_parent_required',
						message: 'invalid parent',
					}),
			})
		).rejects.toMatchObject({
			status: 428,
			reason: 'woo_rxdb_sync_parent_required',
			permanent: false,
		});
	});

	it('non-ok: throws RecordPushError carrying the status, emits push.error', async () => {
		const events: SyncEvent[] = [];
		await expect(
			pushRecordMutation({
				mutation: mut(),
				resolveEndpoint,
				fetcher: async () => jsonResponse(500, {}),
				observe: (e) => events.push(e),
			})
		).rejects.toBeInstanceOf(RecordPushError);
		expect(events[0]).toMatchObject({
			type: 'push.error',
			level: 'error',
			fields: { status: 500 },
		});
	});

	it('marks WooCommerce delete refusals permanent and preserves their code', async () => {
		const events: SyncEvent[] = [];
		await expect(
			pushRecordMutation({
				mutation: mut({ operation: 'delete' }),
				resolveEndpoint,
				fetcher: async () =>
					jsonResponse(403, {
						code: 'woocommerce_rest_cannot_delete',
						message: 'Sorry, you are not allowed to delete this resource.',
					}),
				observe: (event) => events.push(event),
			})
		).rejects.toMatchObject({
			status: 403,
			reason: 'woocommerce_rest_cannot_delete',
			permanent: true,
		});
		expect(events[0]).toMatchObject({
			type: 'push.error',
			fields: { status: 403, reason: 'woocommerce_rest_cannot_delete' },
		});
	});

	it('threads an abort signal into the request init', async () => {
		const controller = new AbortController();
		const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(201, {}));
		await pushRecordMutation({
			mutation: mut(),
			resolveEndpoint,
			fetcher,
			signal: controller.signal,
		});
		expect((fetcher.mock.calls[0][1] as RequestInit).signal).toBe(controller.signal);
	});

	it('mirrors the canonical body into standard headers — Idempotency-Key always, If-Match only with a base revision (ADR 0011)', async () => {
		const fetcher = vi.fn(async (_url: string, _init?: RequestInit) =>
			jsonResponse(200, { id: 4242, meta_data: [{ key: RECORD_UUID_META_KEY, value: UUID }] })
		);

		// update carrying a base revision → Idempotency-Key + quoted If-Match entity-tag
		await pushRecordMutation({
			mutation: mut({ operation: 'update', baseRevision: 'rev-1' }),
			resolveEndpoint,
			fetcher,
		});
		let headers = (fetcher.mock.calls.at(-1)![1] as RequestInit).headers as Record<string, string>;
		expect(headers['Idempotency-Key']).toBe('m1');
		expect(headers['If-Match']).toBe('"rev-1"');

		// create (no base revision) → key only, no If-Match (nothing to condition on)
		await pushRecordMutation({ mutation: mut(), resolveEndpoint, fetcher });
		headers = (fetcher.mock.calls.at(-1)![1] as RequestInit).headers as Record<string, string>;
		expect(headers['Idempotency-Key']).toBe('m1');
		expect(headers['If-Match']).toBeUndefined();

		// durable-restored entry with an UNDEFINED base revision (optional in the queue schema) → still no
		// If-Match. Must not send `If-Match: "undefined"` (which JSON.stringify drops from the body → server 422).
		await pushRecordMutation({
			mutation: { ...mut(), baseRevision: undefined as unknown as null },
			resolveEndpoint,
			fetcher,
		});
		headers = (fetcher.mock.calls.at(-1)![1] as RequestInit).headers as Record<string, string>;
		expect(headers['If-Match']).toBeUndefined();
	});

	it('emits push.error and rethrows when the fetch itself rejects (network failure)', async () => {
		const events: SyncEvent[] = [];
		await expect(
			pushRecordMutation({
				mutation: mut(),
				resolveEndpoint,
				fetcher: async () => {
					throw new TypeError('Failed to fetch');
				},
				observe: (e) => events.push(e),
			})
		).rejects.toThrow('Failed to fetch');
		expect(events[0]).toMatchObject({
			type: 'push.error',
			level: 'error',
			fields: { reason: 'TypeError', message: 'Failed to fetch', phase: 'transport' },
		});
	});

	it('emits push.aborted (warn) and rethrows when the fetch is aborted', async () => {
		const events: SyncEvent[] = [];
		const controller = new AbortController();
		controller.abort();
		const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
		await expect(
			pushRecordMutation({
				mutation: mut(),
				resolveEndpoint,
				fetcher: async () => {
					throw abortErr;
				},
				signal: controller.signal,
				observe: (e) => events.push(e),
			})
		).rejects.toThrow('aborted');
		expect(events[0]).toMatchObject({ type: 'push.aborted', level: 'warn' });
	});

	it("fails fast when a create 2xx returns no parseable document (can't reconcile)", async () => {
		const events: SyncEvent[] = [];
		const noBody = {
			status: 201,
			ok: true,
			json: async () => {
				throw new SyntaxError('Unexpected end of JSON');
			},
		} as unknown as Response;
		await expect(
			pushRecordMutation({
				mutation: mut(),
				resolveEndpoint,
				fetcher: async () => noBody,
				observe: (e) => events.push(e),
			})
		).rejects.toMatchObject({ name: 'RecordPushError', reason: 'no-document' });
		expect(events[0]).toMatchObject({ type: 'push.error', fields: { reason: 'no-document' } });
	});

	it('a throwing extractDocument emits push.error and fails fast (no silent successful push)', async () => {
		const events: SyncEvent[] = [];
		await expect(
			pushRecordMutation({
				mutation: mut(),
				resolveEndpoint,
				fetcher: async () => jsonResponse(201, { id: 1 }),
				extractDocument: () => {
					throw new Error('bad shape');
				},
				observe: (e) => events.push(e),
			})
		).rejects.toMatchObject({ name: 'RecordPushError', reason: 'extract-failed' });
		expect(events[0]).toMatchObject({ type: 'push.error', fields: { reason: 'extract-failed' } });
	});

	it('a throwing observer never breaks the push (best-effort telemetry)', async () => {
		const result = await pushRecordMutation({
			mutation: mut(),
			resolveEndpoint,
			fetcher: async () => jsonResponse(201, { id: 1 }),
			observe: () => {
				throw new Error('sink down');
			},
		});
		expect(result.outcome).toBe('created');
	});
});

// A WordPress fatal answers 500 with the localized "critical error" boilerplate
// as `message` and the PHP error itself in `data.error` — only when the site
// exposes error details. The error names the cause; the boilerplate does not.
// This is the body a Dutch till received on 2026-10-08 (#2439, plugin #2157).
const WP_FATAL_BODY = {
	code: 'internal_server_error',
	message: '<p>Er heeft zich een kritieke fout voorgedaan op deze site.</p>',
	data: {
		status: 500,
		error: {
			type: 1,
			message: 'Allowed memory size of 134217728 bytes exhausted (tried to allocate 16384 bytes)',
			file: '/srv/www/wp-includes/class-wpdb.php',
			line: 2324,
		},
	},
};

describe('pushRecordMutation — the server’s own sentence (#2439)', () => {
	it("carries a WordPress fatal's PHP error, not the critical-error boilerplate, on the error AND the event", async () => {
		const events: SyncEvent[] = [];
		const expected =
			'Allowed memory size of 134217728 bytes exhausted (tried to allocate 16384 bytes) in wp-includes/class-wpdb.php:2324';
		await expect(
			pushRecordMutation({
				mutation: mut(),
				resolveEndpoint,
				fetcher: async () => jsonResponse(500, WP_FATAL_BODY),
				observe: (event) => events.push(event),
			})
		).rejects.toMatchObject({
			status: 500,
			reason: 'internal_server_error',
			permanent: false,
			serverMessage: expected,
		});
		// The ledger row is written from the EVENT (a 500 is retried, never
		// dead-lettered), so the sentence has to ride the event to be seen at all.
		expect(events[0]).toMatchObject({
			type: 'push.error',
			level: 'error',
			fields: { status: 500, reason: 'internal_server_error', serverMessage: expected },
		});
	});

	it('keeps the top-level message as the sentence when the site hides error details, without its HTML', async () => {
		const events: SyncEvent[] = [];
		const plain =
			'There has been a critical error on this website. Learn more about troubleshooting WordPress.';
		await expect(
			pushRecordMutation({
				mutation: mut(),
				resolveEndpoint,
				fetcher: async () =>
					jsonResponse(500, {
						code: 'internal_server_error',
						message:
							'<p>There has been a critical error on this website.</p><p><a href="https://wordpress.org/documentation/article/faq-troubleshooting/">Learn more about troubleshooting WordPress.</a></p>',
						data: { status: 500 },
					}),
				observe: (event) => events.push(event),
			})
		).rejects.toMatchObject({ serverMessage: plain });
		expect(events[0]).toMatchObject({ fields: { serverMessage: plain } });
	});

	it('keeps a lone `<` as text and stays linear on a run of them', async () => {
		await expect(
			pushRecordMutation({
				mutation: mut(),
				resolveEndpoint,
				fetcher: async () =>
					jsonResponse(500, {
						code: 'x',
						message: `Stock <b>fell</b> below 3 ${'<'.repeat(5_000)}`,
					}),
			})
		).rejects.toMatchObject({ serverMessage: `Stock fell below 3 ${'<'.repeat(5_000)}` });
	});

	it('stays linear on a long run of unclosed tag openers', async () => {
		const run = '<a'.repeat(100_000);
		const started = Date.now();
		await expect(
			pushRecordMutation({
				mutation: mut(),
				resolveEndpoint,
				fetcher: async () => jsonResponse(500, { code: 'x', message: `${run}>` }),
			})
		).rejects.toMatchObject({ serverMessage: expect.stringContaining('<a<a<a') });
		expect(Date.now() - started).toBeLessThan(2_000);
	});

	it('keeps comparison operators as text — only tag syntax opens a tag', async () => {
		await expect(
			pushRecordMutation({
				mutation: mut(),
				resolveEndpoint,
				fetcher: async () =>
					jsonResponse(500, {
						code: 'x',
						message: 'Expected x < 5 and y > 2 in <b>wpdb</b> <!-- note -->',
					}),
			})
		).rejects.toMatchObject({ serverMessage: 'Expected x < 5 and y > 2 in wpdb' });
		await expect(
			pushRecordMutation({
				mutation: mut(),
				resolveEndpoint,
				fetcher: async () =>
					jsonResponse(500, { code: 'x', message: 'Expected x<y and z>2 in <b>wpdb</b>' }),
			})
		).rejects.toMatchObject({ serverMessage: 'Expected x<y and z>2 in wpdb' });
	});

	it('leaves a 4xx body’s own `data.error` object alone — the top-level message was written for the cashier', async () => {
		await expect(
			pushRecordMutation({
				mutation: mut(),
				resolveEndpoint,
				fetcher: async () =>
					jsonResponse(400, {
						code: 'rest_invalid_param',
						message: 'Invalid parameter(s): billing',
						data: { status: 400, error: { message: 'gateway: card_declined', file: 'x.php' } },
					}),
			})
		).rejects.toMatchObject({ serverMessage: 'Invalid parameter(s): billing' });
	});

	it('keeps the location under the observer’s 200-character cap: first line only, budgeted, host path dropped', async () => {
		const longFirstLine = `Uncaught Exception: ${'x'.repeat(300)}`;
		await expect(
			pushRecordMutation({
				mutation: mut(),
				resolveEndpoint,
				fetcher: async () =>
					jsonResponse(500, {
						...WP_FATAL_BODY,
						data: {
							status: 500,
							error: {
								type: 1,
								message: `${longFirstLine}\nStack trace:\n#0 /home/u1/public_html/wp-content/plugins/acme/acme.php(12): boom()`,
								file: '/home/u1/domains/shop.example/public_html/wp-content/plugins/acme/includes/class-acme-sync.php',
								line: 412,
							},
						},
					}),
			})
		).rejects.toMatchObject({
			serverMessage: expect.stringMatching(
				/^Uncaught Exception: x+… in wp-content\/plugins\/acme\/includes\/class-acme-sync\.php:412$/
			),
		});
		// The whole sentence fits the cap, so the location survives `sanitizeReason`.
		const error = await pushRecordMutation({
			mutation: mut(),
			resolveEndpoint,
			fetcher: async () =>
				jsonResponse(500, {
					...WP_FATAL_BODY,
					data: {
						status: 500,
						error: {
							message: `${longFirstLine}\nStack trace`,
							file: '/home/u1/public_html/wp-content/plugins/acme/includes/class-acme-sync.php',
							line: 412,
						},
					},
				}),
		}).catch((e: RecordPushError) => e);
		expect((error as RecordPushError).serverMessage!.length).toBeLessThanOrEqual(200);
		expect((error as RecordPushError).serverMessage).not.toContain('Stack trace');
	});

	it('drops a long plugin path to its file name so the line number still fits under the cap', async () => {
		const deepPath = `/home/u1/public_html/wp-content/plugins/${'very-long-vendor-segment/'.repeat(8)}class-acme-sync.php`;
		const error = await pushRecordMutation({
			mutation: mut(),
			resolveEndpoint,
			fetcher: async () =>
				jsonResponse(500, {
					...WP_FATAL_BODY,
					data: {
						status: 500,
						error: { message: `Uncaught Exception: ${'x'.repeat(300)}`, file: deepPath, line: 412 },
					},
				}),
		}).catch((e: RecordPushError) => e);
		const sentence = (error as RecordPushError).serverMessage!;
		expect(sentence).toMatch(/^Uncaught Exception: x+… in class-acme-sync\.php:412$/);
		expect(sentence.length).toBeLessThanOrEqual(200);
	});

	it('reads a Windows host path and bounds an absurd file name, keeping the line number', async () => {
		const readSentence = async (file: string) =>
			(
				(await pushRecordMutation({
					mutation: mut(),
					resolveEndpoint,
					fetcher: async () =>
						jsonResponse(500, {
							...WP_FATAL_BODY,
							data: { status: 500, error: { message: 'Boom', file, line: 7 } },
						}),
				}).catch((e: RecordPushError) => e)) as RecordPushError
			).serverMessage!;

		expect(await readSentence('C:\\inetpub\\wwwroot\\wp-includes\\class-wpdb.php')).toBe(
			'Boom in wp-includes/class-wpdb.php:7'
		);
		expect(await readSentence('C:\\inetpub\\wwwroot\\boot.php')).toBe('Boom in boot.php:7');
		const silly = await readSentence(`/srv/${'f'.repeat(400)}.php`);
		expect(silly).toMatch(/^Boom in …f+\.php:7$/);
		expect(silly.length).toBeLessThanOrEqual(200);
	});

	it('treats a message that is only markup as no sentence', async () => {
		await expect(
			pushRecordMutation({
				mutation: mut(),
				resolveEndpoint,
				fetcher: async () => jsonResponse(500, { code: 'x', message: '<p></p>' }),
			})
		).rejects.toMatchObject({ serverMessage: undefined });
	});

	it('omits serverMessage entirely when the body has no sentence (an HTML host page, an empty body)', async () => {
		const events: SyncEvent[] = [];
		await expect(
			pushRecordMutation({
				mutation: mut(),
				resolveEndpoint,
				fetcher: async () => jsonResponse(502, {}),
				observe: (event) => events.push(event),
			})
		).rejects.toMatchObject({ status: 502 });
		expect(events[0]?.fields).not.toHaveProperty('serverMessage');
		expect((events[0]?.fields as Record<string, unknown>).reason).toBeUndefined();
	});

	it('reads the fatal detail without a file as the bare PHP message', async () => {
		await expect(
			pushRecordMutation({
				mutation: mut(),
				resolveEndpoint,
				fetcher: async () =>
					jsonResponse(500, {
						...WP_FATAL_BODY,
						data: { status: 500, error: { type: 1, message: 'Out of memory' } },
					}),
			})
		).rejects.toMatchObject({ serverMessage: 'Out of memory' });
	});
});

describe('pushEndpointResolver', () => {
	it('routes each mutation to {syncBase}/push/{collection} via POST', () => {
		const resolve = pushEndpointResolver('https://shop.example/wp-json/wcpos/v2/');
		expect(resolve(mut({ collectionName: 'customers' }))).toEqual({
			url: 'https://shop.example/wp-json/wcpos/v2/push/customers',
			method: 'POST',
		});
		expect(resolve(mut({ collectionName: 'products' })).url).toBe(
			'https://shop.example/wp-json/wcpos/v2/push/products'
		);
	});
});

describe('reconcileCreateAck', () => {
	it('keeps the recordId and returns the server-assigned remote id when the server reused our uuid', () => {
		const r = reconcileCreateAck(mut(), {
			id: 4242,
			meta_data: [{ key: RECORD_UUID_META_KEY, value: UUID }],
		});
		expect(r).toEqual({ recordId: UUID, remoteId: '4242' });
	});

	it('tolerates a server document without meta_data (remoteId from id)', () => {
		expect(reconcileCreateAck(mut(), { id: 7 })).toEqual({ recordId: UUID, remoteId: '7' });
	});

	it('throws if the server came back with a DIFFERENT uuid (never re-key)', () => {
		expect(() =>
			reconcileCreateAck(mut(), {
				id: 1,
				meta_data: [{ key: RECORD_UUID_META_KEY, value: '00000000-0000-4000-8000-000000000099' }],
			})
		).toThrow(/never be re-keyed/);
	});
});
