import { of } from 'rxjs';

import {
	__resetDrainLocksForTests,
	backoffMs,
	BASE_BACKOFF_MS,
	drainReceiptEmailQueue,
	enqueueReceiptEmail,
	MAX_BACKOFF_MS,
	type ReceiptEmailDoc,
	type ReceiptEmailQueuePort,
	type ReceiptEmailRow,
	retryReceiptEmail,
} from './queue';

const silentLogger = () => ({
	debug: jest.fn(),
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
});

/** In-memory stand-in for the RxDB collection, with the same read/patch surface. */
function createFakeCollection(seed: ReceiptEmailRow[] = []) {
	const docs: ReceiptEmailDoc[] = [];

	const wrap = (row: ReceiptEmailRow): ReceiptEmailDoc => {
		const doc = { ...row, deleted: false } as ReceiptEmailDoc & {
			deleted: boolean;
			getLatest(): ReceiptEmailDoc;
		};
		doc.incrementalPatch = async (patch: Partial<ReceiptEmailRow>) => {
			if (!docs.includes(doc)) throw new Error('RxError: document is removed');
			Object.assign(doc, patch);
			return doc;
		};
		doc.remove = async () => {
			const index = docs.indexOf(doc);
			if (index >= 0) docs.splice(index, 1);
			doc.deleted = true;
			return doc;
		};
		// RxDB hands callers the freshest revision through getLatest(); the fake
		// mutates in place, so the doc IS its own latest revision.
		doc.getLatest = () => doc;
		return doc;
	};

	seed.forEach((row) => docs.push(wrap(row)));

	const collection: ReceiptEmailQueuePort & { docs: ReceiptEmailDoc[] } = {
		docs,
		insert: async (row: ReceiptEmailRow) => {
			const doc = wrap(row);
			docs.push(doc);
			return doc;
		},
		find: (query: { selector: Record<string, unknown> }) => {
			const status = (query.selector.status as { $eq?: string } | undefined)?.$eq;
			const localID = (query.selector.localID as { $eq?: string } | undefined)?.$eq;
			const matching = () =>
				docs.filter(
					(doc) =>
						(status ? doc.status === status : true) && (localID ? doc.localID === localID : true)
				);
			return { exec: async () => matching(), $: of(matching()) };
		},
	};
	return collection;
}

const pendingRow = (over: Partial<ReceiptEmailRow> = {}): ReceiptEmailRow => ({
	localID: 'row-1',
	orderId: 42,
	email: 'customer@example.com',
	saveTo: '',
	status: 'pending',
	queuedAt: '2026-08-06T10:00:00.000Z',
	attempts: 0,
	...over,
});

/** An axios-shaped rejection carrying a real HTTP status. */
const httpError = (status: number, message: string) =>
	Object.assign(new Error(message), {
		isAxiosError: true,
		response: { status, data: { message } },
		wpMessage: message,
	});

/** A transport failure: the request went out, nothing came back. */
const networkError = () =>
	Object.assign(new Error('Network Error'), { isAxiosError: true, code: 'ERR_NETWORK' });

/** The shape `useHttpClient` throws when the device is known to be offline. */
const offlineError = () =>
	Object.assign(new Error('No internet connection'), {
		isPreFlightBlocked: true,
		errorCode: 'API01007',
	});

beforeEach(() => {
	__resetDrainLocksForTests();
});

describe('enqueueReceiptEmail', () => {
	it('durably queues an offline send and posts nothing', async () => {
		const collection = createFakeCollection();
		const post = jest.fn();

		const result = await enqueueReceiptEmail(
			{ collection, now: () => Date.parse('2026-08-06T10:00:00.000Z'), uuid: () => 'row-1' },
			{ orderId: 42, orderNumber: '1042', email: 'customer@example.com', saveTo: 'billing' }
		);

		expect(result).toEqual({ localID: 'row-1', deduplicated: false });
		expect(post).not.toHaveBeenCalled();
		expect(collection.docs).toHaveLength(1);
		expect(collection.docs[0]).toMatchObject({
			orderId: 42,
			orderNumber: '1042',
			email: 'customer@example.com',
			saveTo: 'billing',
			status: 'pending',
			attempts: 0,
			queuedAt: '2026-08-06T10:00:00.000Z',
		});
	});

	it('folds a repeat tap into the pending row rather than queuing twice', async () => {
		const collection = createFakeCollection([pendingRow()]);

		const result = await enqueueReceiptEmail(
			{ collection, uuid: () => 'row-2' },
			{
				orderId: 42,
				email: 'customer@example.com',
			}
		);

		expect(result).toEqual({ localID: 'row-1', deduplicated: true });
		expect(collection.docs).toHaveLength(1);
	});

	it('serializes concurrent taps so a race cannot queue the same email twice', async () => {
		const collection = createFakeCollection();
		let next = 0;
		const uuid = () => `row-${(next += 1)}`;

		await Promise.all([
			enqueueReceiptEmail({ collection, uuid }, { orderId: 42, email: 'customer@example.com' }),
			enqueueReceiptEmail({ collection, uuid }, { orderId: 42, email: 'customer@example.com' }),
		]);

		expect(collection.docs).toHaveLength(1);
	});

	it('adopts a save-to-billing request the first tap did not make', async () => {
		const collection = createFakeCollection([pendingRow({ saveTo: '' })]);

		await enqueueReceiptEmail(
			{ collection, uuid: () => 'row-2' },
			{ orderId: 42, email: 'customer@example.com', saveTo: 'billing' }
		);

		expect(collection.docs).toHaveLength(1);
		expect(collection.docs[0].saveTo).toBe('billing');
	});

	it('keeps a different address for the same order as its own row', async () => {
		const collection = createFakeCollection([pendingRow()]);

		await enqueueReceiptEmail(
			{ collection, uuid: () => 'row-2' },
			{
				orderId: 42,
				email: 'someone.else@example.com',
			}
		);

		expect(collection.docs).toHaveLength(2);
	});
});

describe('drainReceiptEmailQueue', () => {
	it('posts the queued email and marks the row sent when the connection returns', async () => {
		const collection = createFakeCollection([pendingRow({ saveTo: 'billing' })]);
		const post = jest.fn(async (row: ReceiptEmailRow): Promise<{ data: { success: boolean } }> => {
			void row;
			return { data: { success: true } };
		});

		const summary = await drainReceiptEmailQueue({
			collection,
			post,
			logger: silentLogger(),
			now: () => Date.parse('2026-08-06T10:05:00.000Z'),
			sleep: async () => undefined,
		});

		expect(summary).toEqual({ sent: 1, failed: 0, deferred: 0 });
		expect(post).toHaveBeenCalledTimes(1);
		expect(post.mock.calls[0][0]).toMatchObject({
			orderId: 42,
			email: 'customer@example.com',
			saveTo: 'billing',
		});
		// A delivered email is history — the row is pruned so the collection
		// cannot grow without bound on a till that is never cleared.
		expect(collection.docs).toHaveLength(0);
	});

	it('sends oldest first and spaces consecutive sends', async () => {
		const collection = createFakeCollection([
			pendingRow({ localID: 'b', queuedAt: '2026-08-06T11:00:00.000Z', email: 'b@example.com' }),
			pendingRow({ localID: 'a', queuedAt: '2026-08-06T09:00:00.000Z', email: 'a@example.com' }),
		]);
		const post = jest.fn(async (row: ReceiptEmailRow): Promise<{ data: { success: boolean } }> => {
			void row;
			return { data: { success: true } };
		});
		const sleep = jest.fn(async () => undefined);

		await drainReceiptEmailQueue({
			collection,
			post,
			logger: silentLogger(),
			now: () => Date.parse('2026-08-06T12:00:00.000Z'),
			sleep,
		});

		expect(post.mock.calls.map((call) => call[0].localID)).toEqual(['a', 'b']);
		// One gap between the two sends — never before the first.
		expect(sleep).toHaveBeenCalledTimes(1);
	});

	it('retries a transient failure with backoff, incrementing attempts', async () => {
		const collection = createFakeCollection([pendingRow()]);
		const logger = silentLogger();
		let clock = Date.parse('2026-08-06T10:05:00.000Z');
		const post = jest.fn(async () => {
			throw networkError();
		});
		const deps = {
			collection,
			post,
			logger,
			now: () => clock,
			sleep: async () => undefined,
		};

		await drainReceiptEmailQueue(deps);
		expect(collection.docs[0]).toMatchObject({
			status: 'pending',
			attempts: 1,
			nextAttemptAt: new Date(clock + BASE_BACKOFF_MS).toISOString(),
		});
		expect(post).toHaveBeenCalledTimes(1);

		// Still inside the backoff window: the row is left alone.
		clock += BASE_BACKOFF_MS - 1;
		const deferred = await drainReceiptEmailQueue(deps);
		expect(deferred).toEqual({ sent: 0, failed: 0, deferred: 1 });
		expect(post).toHaveBeenCalledTimes(1);

		// Backoff elapsed: one more try, and the next window is twice as long.
		clock += 1;
		await drainReceiptEmailQueue(deps);
		expect(post).toHaveBeenCalledTimes(2);
		expect(collection.docs[0]).toMatchObject({
			status: 'pending',
			attempts: 2,
			nextAttemptAt: new Date(clock + BASE_BACKOFF_MS * 2).toISOString(),
		});
	});

	it('gives up after the attempt budget and keeps the reason', async () => {
		const collection = createFakeCollection([pendingRow({ attempts: 5 })]);
		const post = jest.fn(async () => {
			throw networkError();
		});

		const summary = await drainReceiptEmailQueue({
			collection,
			post,
			logger: silentLogger(),
			now: () => Date.parse('2026-08-06T10:05:00.000Z'),
			sleep: async () => undefined,
			maxAttempts: 6,
		});

		expect(summary.failed).toBe(1);
		expect(collection.docs[0]).toMatchObject({ status: 'failed', attempts: 6 });
		expect(collection.docs[0].lastError).toContain('Network Error');
		expect(collection.docs[0].lastError).toContain('gave up');
	});

	it('fails a permanently-refused row with the reason and never retries it', async () => {
		const collection = createFakeCollection([pendingRow()]);
		const post = jest.fn(async () => {
			throw httpError(400, 'Invalid email address.');
		});
		const deps = {
			collection,
			post,
			logger: silentLogger(),
			now: () => Date.parse('2026-08-06T10:05:00.000Z'),
			sleep: async () => undefined,
		};

		const summary = await drainReceiptEmailQueue(deps);
		expect(summary).toEqual({ sent: 0, failed: 1, deferred: 0 });
		expect(collection.docs[0]).toMatchObject({
			status: 'failed',
			attempts: 1,
			lastError: 'Invalid email address.',
		});

		// A later drain must not pick it up again — no retry loop.
		await drainReceiptEmailQueue(deps);
		expect(post).toHaveBeenCalledTimes(1);
	});

	it('treats a 200 that did not send as a refusal, not a transport failure', async () => {
		const collection = createFakeCollection([pendingRow()]);
		const post = jest.fn(async () => ({ data: { success: false, message: 'No template.' } }));

		await drainReceiptEmailQueue({
			collection,
			post,
			logger: silentLogger(),
			now: () => Date.parse('2026-08-06T10:05:00.000Z'),
			sleep: async () => undefined,
		});

		expect(collection.docs[0]).toMatchObject({ status: 'failed', lastError: 'No template.' });
	});

	it('stops the pass when the transport is down instead of hammering the server', async () => {
		const collection = createFakeCollection([
			pendingRow({ localID: 'a', queuedAt: '2026-08-06T09:00:00.000Z' }),
			pendingRow({ localID: 'b', queuedAt: '2026-08-06T09:30:00.000Z', email: 'b@example.com' }),
			pendingRow({ localID: 'c', queuedAt: '2026-08-06T09:45:00.000Z', email: 'c@example.com' }),
		]);
		const post = jest.fn(async () => {
			throw offlineError();
		});

		const summary = await drainReceiptEmailQueue({
			collection,
			post,
			logger: silentLogger(),
			now: () => Date.parse('2026-08-06T10:00:00.000Z'),
			sleep: async () => undefined,
		});

		expect(post).toHaveBeenCalledTimes(1);
		expect(summary.deferred).toBe(3);
		// The rows behind it keep their untouched attempt budget.
		expect(collection.docs[1]).toMatchObject({ attempts: 0, status: 'pending' });
	});

	it('keeps going past a row the server refused', async () => {
		const collection = createFakeCollection([
			pendingRow({ localID: 'a', queuedAt: '2026-08-06T09:00:00.000Z' }),
			pendingRow({ localID: 'b', queuedAt: '2026-08-06T09:30:00.000Z', email: 'b@example.com' }),
		]);
		const post = jest.fn(async (row: ReceiptEmailRow) => {
			if (row.localID === 'a') throw httpError(400, 'Invalid email address.');
			return { data: { success: true } };
		});

		const summary = await drainReceiptEmailQueue({
			collection,
			post,
			logger: silentLogger(),
			now: () => Date.parse('2026-08-06T10:00:00.000Z'),
			sleep: async () => undefined,
		});

		expect(summary).toEqual({ sent: 1, failed: 1, deferred: 0 });
	});

	it('never sends the same row twice when a second drain races the first', async () => {
		const collection = createFakeCollection([pendingRow()]);
		let release: (() => void) | undefined;
		const inFlight = new Promise<void>((resolve) => {
			release = resolve;
		});
		const post = jest.fn(async () => {
			await inFlight;
			return { data: { success: true } };
		});
		const deps = {
			collection,
			post,
			logger: silentLogger(),
			now: () => Date.parse('2026-08-06T10:00:00.000Z'),
			sleep: async () => undefined,
		};

		const first = drainReceiptEmailQueue(deps);
		// A cashier pressing Retry while the connectivity-restore drain is mid-post.
		const second = drainReceiptEmailQueue(deps);
		release?.();
		await Promise.all([first, second]);

		expect(post).toHaveBeenCalledTimes(1);
		expect(collection.docs).toHaveLength(0);
	});

	it('picks up work enqueued while a drain was already running', async () => {
		const collection = createFakeCollection([pendingRow()]);
		let release: (() => void) | undefined;
		const inFlight = new Promise<void>((resolve) => {
			release = resolve;
		});
		const post = jest.fn(async () => {
			await inFlight;
			return { data: { success: true } };
		});
		const deps = {
			collection,
			post,
			logger: silentLogger(),
			now: () => Date.parse('2026-08-06T10:00:00.000Z'),
			sleep: async () => undefined,
		};

		const first = drainReceiptEmailQueue(deps);
		await enqueueReceiptEmail(
			{ collection, uuid: () => 'row-2' },
			{
				orderId: 43,
				email: 'later@example.com',
			}
		);
		const second = drainReceiptEmailQueue(deps);
		release?.();
		const [summary] = await Promise.all([first, second]);

		expect(post).toHaveBeenCalledTimes(2);
		expect(summary.sent).toBe(2);
	});
});

describe('drain hardening (adversarial findings)', () => {
	it('does not spend an attempt on a block that never left the device', async () => {
		const collection = createFakeCollection([pendingRow()]);
		let clock = Date.parse('2026-08-06T10:00:00.000Z');
		const post = jest.fn(async () => {
			throw offlineError();
		});
		const deps = {
			collection,
			post,
			logger: silentLogger(),
			now: () => clock,
			sleep: async () => undefined,
			maxAttempts: 2,
		};

		// Six passes against a till that cannot reach the network at all.
		for (let i = 0; i < 6; i += 1) {
			await drainReceiptEmailQueue(deps);
			clock += MAX_BACKOFF_MS;
		}

		// The budget bounds futile SERVER round trips; none happened.
		expect(collection.docs[0]).toMatchObject({ status: 'pending', attempts: 0 });
	});

	it('clips a server essay so the row can still record its outcome', async () => {
		const collection = createFakeCollection([pendingRow()]);
		const essay = 'x'.repeat(5_000);
		const post = jest.fn(async () => {
			throw httpError(400, essay);
		});

		await drainReceiptEmailQueue({
			collection,
			post,
			logger: silentLogger(),
			now: () => Date.parse('2026-08-06T10:00:00.000Z'),
			sleep: async () => undefined,
		});

		// Left unclipped this patch fails schema validation, the row stays pending
		// with no backoff, and the 60s tick re-posts it forever.
		expect(collection.docs[0].status).toBe('failed');
		expect((collection.docs[0].lastError ?? '').length).toBeLessThanOrEqual(500);
	});

	it('survives a row the merchant removed while its send was in flight', async () => {
		const collection = createFakeCollection([pendingRow()]);
		const doc = collection.docs[0];
		const post = jest.fn(async () => {
			await doc.remove();
			return { data: { success: true } };
		});

		const summary = await drainReceiptEmailQueue({
			collection,
			post,
			logger: silentLogger(),
			now: () => Date.parse('2026-08-06T10:00:00.000Z'),
			sleep: async () => undefined,
		});

		expect(summary.sent).toBe(1);
		expect(collection.docs).toHaveLength(0);
	});

	it('skips a later row removed during the spacing delay', async () => {
		const collection = createFakeCollection([
			pendingRow({ localID: 'a', queuedAt: '2026-08-06T09:00:00.000Z' }),
			pendingRow({ localID: 'b', queuedAt: '2026-08-06T09:30:00.000Z', email: 'b@example.com' }),
		]);
		const removed = collection.docs[1];
		const post = jest.fn(async () => ({ data: { success: true } }));

		const summary = await drainReceiptEmailQueue({
			collection,
			post,
			logger: silentLogger(),
			now: () => Date.parse('2026-08-06T10:00:00.000Z'),
			sleep: async () => {
				await removed.remove();
			},
		});

		expect(post).toHaveBeenCalledTimes(1);
		expect(post).toHaveBeenCalledWith(expect.objectContaining({ localID: 'a' }));
		expect(summary.sent).toBe(1);
	});

	it('propagates an unexpected queue state write failure', async () => {
		const collection = createFakeCollection([pendingRow()]);
		const doc = collection.docs[0];
		const incrementalPatch = doc.incrementalPatch;
		const storageError = new Error('storage unavailable');
		let writes = 0;
		doc.incrementalPatch = async (changes) => {
			writes += 1;
			if (writes === 1) throw storageError;
			return incrementalPatch(changes);
		};

		await expect(
			drainReceiptEmailQueue({
				collection,
				post: async () => ({ data: { success: true } }),
				logger: silentLogger(),
				now: () => Date.parse('2026-08-06T10:00:00.000Z'),
				sleep: async () => undefined,
			})
		).rejects.toBe(storageError);
	});

	it('does not run another pass after the transport went down', async () => {
		const collection = createFakeCollection([
			pendingRow({ localID: 'a', queuedAt: '2026-08-06T09:00:00.000Z' }),
			pendingRow({ localID: 'b', queuedAt: '2026-08-06T09:30:00.000Z', email: 'b@example.com' }),
		]);
		let release: (() => void) | undefined;
		const inFlight = new Promise<void>((resolve) => {
			release = resolve;
		});
		const post = jest.fn(async () => {
			await inFlight;
			throw networkError();
		});
		const deps = {
			collection,
			post,
			logger: silentLogger(),
			now: () => Date.parse('2026-08-06T10:00:00.000Z'),
			sleep: async () => undefined,
		};

		const first = drainReceiptEmailQueue(deps);
		// The 60s tick landing mid-pass would otherwise force a second pass that
		// spends row b's attempt against the same dead connection, unspaced.
		const second = drainReceiptEmailQueue(deps);
		release?.();
		await Promise.all([first, second]);

		expect(post).toHaveBeenCalledTimes(1);
		expect(collection.docs[1]).toMatchObject({ attempts: 0 });
	});
});

describe('retryReceiptEmail', () => {
	it('returns a failed row to the pending lane with a fresh budget', async () => {
		const collection = createFakeCollection([
			pendingRow({ status: 'failed', attempts: 6, lastError: 'Invalid email address.' }),
		]);

		await expect(retryReceiptEmail(collection.docs[0])).resolves.toBe(true);

		expect(collection.docs[0]).toMatchObject({
			status: 'pending',
			attempts: 0,
			nextAttemptAt: '',
			lastError: '',
		});
	});

	it('refuses to resurrect a row that is not failed — a stale click must not re-send', async () => {
		const collection = createFakeCollection([pendingRow({ status: 'sent' })]);

		await expect(retryReceiptEmail(collection.docs[0])).resolves.toBe(false);
		expect(collection.docs[0].status).toBe('sent');
	});
});

describe('backoffMs', () => {
	it('doubles from the base and stops at the ceiling', () => {
		expect(backoffMs(1)).toBe(BASE_BACKOFF_MS);
		expect(backoffMs(2)).toBe(BASE_BACKOFF_MS * 2);
		expect(backoffMs(3)).toBe(BASE_BACKOFF_MS * 4);
		expect(backoffMs(50)).toBe(MAX_BACKOFF_MS);
	});
});
