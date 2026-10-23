import type { EngineRecord } from '@wcpos/query';

import {
	answerOf,
	answerReadsPaid,
	landAnswer,
	mirrorAnswer,
	saleOutcomeOf,
	stampCompletionIfMissing,
	type StoreAnswer,
} from './land-answer';
import { completionMetaFor } from '../checkout/sale-completion';

jest.mock('../checkout/sale-completion', () => ({
	...jest.requireActual('../checkout/sale-completion'),
	completionMetaFor: jest.fn(async () => [{ key: '_wcpos_sale_counter', value: '7' }]),
}));
const mockRefresh = jest.fn(async (..._args: unknown[]) => 'refreshed');
jest.mock('../checkout/hooks/reconcile-completed-order', () => ({
	refreshOrderRecord: (...args: unknown[]) => mockRefresh(...args),
}));

let meta: { key: string; value: unknown }[] = [];
const order = {
	uuid: 'order-1',
	getLatest: () => ({ payload: { id: 42, meta_data: meta } }),
} as unknown as EngineRecord<'orders'>;

function setup() {
	const stampCompletion = jest.fn(async () => true);
	const poster = { mirror: jest.fn(async () => undefined) };
	const ctx = { userDB: {}, siteUuid: 'site', storeId: 1, runtime: 'runtime', stampCompletion };
	const facts = { sessionId: 'session' };
	const land = mirrorAnswer({ ctx: ctx as never, order, poster, facts });
	return { stampCompletion, poster, land };
}

beforeEach(() => {
	jest.clearAllMocks();
	meta = [];
});

describe('mirrorAnswer', () => {
	it('mirrors, then stamps the provenance once when the answer completes the sale', async () => {
		const { stampCompletion, poster, land } = setup();
		const answer = { order: { status: 'completed' } as never };
		await expect(land(answer)).resolves.toBeNull();
		expect(poster.mirror).toHaveBeenCalledWith(answer);
		expect(completionMetaFor).toHaveBeenCalledWith(expect.anything(), [], {
			sessionId: 'session',
		});
		expect(stampCompletion).toHaveBeenCalledTimes(1);
		expect(stampCompletion).toHaveBeenCalledWith(order, [
			{ key: '_wcpos_sale_counter', value: '7' },
		]);
		expect(poster.mirror.mock.invocationCallOrder[0]).toBeLessThan(
			stampCompletion.mock.invocationCallOrder[0]
		);
		expect(mockRefresh).not.toHaveBeenCalled();
	});

	it('stamps nothing when the order already holds its provenance', async () => {
		meta = [{ key: '_wcpos_sale_counter', value: '3' }];
		const { stampCompletion, land } = setup();
		await expect(land({ order: { status: 'completed' } as never })).resolves.toBeNull();
		expect(stampCompletion).not.toHaveBeenCalled();
	});

	it('stamps nothing for an open status, or for an answer that is not accepted (a refusal, a cancel)', async () => {
		const { stampCompletion, land } = setup();
		await land({ order: { status: 'pos-partial' } as never });
		await land({ order: { status: 'completed' } as never }, { accepted: false });
		expect(stampCompletion).not.toHaveBeenCalled();
	});

	it('a mirror that throws refreshes the order, then reports { cause }', async () => {
		const { stampCompletion, poster, land } = setup();
		const cause = new Error('write failed');
		poster.mirror.mockRejectedValueOnce(cause);
		await expect(land({ order: { status: 'completed' } as never })).resolves.toEqual({
			cause,
		});
		expect(mockRefresh).toHaveBeenCalledWith('runtime', 42);
		expect(stampCompletion).not.toHaveBeenCalled();
	});

	it('a stamp that does not land refreshes the order, then reports { cause }', async () => {
		const { stampCompletion, land } = setup();
		stampCompletion.mockResolvedValueOnce(false);
		await expect(land({ order: { status: 'completed' } as never })).resolves.toEqual({
			cause: new Error('provenance_save_failed'),
		});
		expect(mockRefresh).toHaveBeenCalledWith('runtime', 42);
	});

	it('a failed refresh still reports the mirror failure, never throws', async () => {
		const { poster, land } = setup();
		poster.mirror.mockRejectedValue(new Error('write failed'));
		mockRefresh.mockRejectedValueOnce(new Error('offline'));
		await expect(land({ order: null })).resolves.toMatchObject({ cause: expect.any(Error) });
		// A refresh that throws before it returns a promise (no engine yet) is caught too.
		mockRefresh.mockImplementationOnce(() => {
			throw new Error('no engine');
		});
		await expect(land({ order: null })).resolves.toMatchObject({ cause: expect.any(Error) });
	});
});

describe('stampCompletionIfMissing', () => {
	it('throws when the stamp does not land', async () => {
		const stampCompletion = jest.fn(async () => false);
		await expect(
			stampCompletionIfMissing({ stampCompletion } as never, order, 'processing')
		).rejects.toThrow('provenance_save_failed');
	});
});

const row = { id: 'payment-1', amount: '10.00' } as never;
const minted = { id: 'a1', amount: '10.00', status: 'captured' } as never;
const stamp = {
	method_id: 'wcpos_email_invoice',
	destination: 'a@b.c',
	attempt_id: 'a1',
	sent_at_gmt: '2026-10-20T10:00:00Z',
	cashier_id: 7,
} as never;
const summary = (status: string, balance = '0.00') => ({ status, balance }) as never;
const press = { via: 'press', remainingMinor: 0 } as const;
const tryAgain = { via: 'try-again', remainingMinor: 0 } as const;

// The one table: a store answer plus how it arrived is the outcome the completion judges.
describe('saleOutcomeOf', () => {
	it.each([
		[
			'a record online at the press',
			{ kind: 'recorded', via: 'online', row, order: summary('completed') },
			press,
			false,
			{
				source: 'manual',
				via: 'online',
				row,
				order: summary('completed'),
				mirrorFailed: false,
				remainingMinor: 0,
			},
		],
		[
			'a record offline, a balance still due',
			{ kind: 'recorded', via: 'offline', row, order: null },
			{ via: 'press', remainingMinor: 500 },
			false,
			{
				source: 'manual',
				via: 'offline',
				row,
				order: null,
				mirrorFailed: false,
				remainingMinor: 500,
			},
		],
		[
			'a record whose mirror failed',
			{ kind: 'recorded', via: 'online', row, order: summary('completed') },
			press,
			true,
			{
				source: 'manual',
				via: 'online',
				row,
				order: summary('completed'),
				mirrorFailed: true,
				remainingMinor: 0,
			},
		],
		[
			'a submit sent',
			{ kind: 'sent', order: summary('pending', '10.00'), stamp },
			press,
			false,
			{ source: 'gateway', order: summary('pending', '10.00'), stamp },
		],
		[
			'a submit settled',
			{ kind: 'settled', order: summary('pending', '10.00') },
			tryAgain,
			false,
			{ source: 'gateway-settled', order: summary('pending', '10.00') },
		],
		[
			'a close',
			{ kind: 'close', order: summary('completed') },
			tryAgain,
			false,
			{ source: 'zero-balance', order: summary('completed') },
		],
	] as const)('%s', (_, answer, arrival, mirrorFailed, outcome) =>
		expect(saleOutcomeOf(answer as StoreAnswer as never, arrival, mirrorFailed)).toEqual(outcome)
	);

	it('a press and a Try again with the same prediction land the same outcome', () => {
		const answer = { kind: 'recorded', via: 'online', row, order: null } as const;
		expect(saleOutcomeOf(answer, press, false)).toEqual(saleOutcomeOf(answer, tryAgain, false));
	});
});

// Only the answer settles the command; `finish` (the resident's judge) completes the sale.
describe('landAnswer', () => {
	it.each([
		[
			'a record that completed',
			{ kind: 'recorded', via: 'online', row, order: summary('completed') },
			'completed',
			'completed',
		],
		[
			'a record on a sale reopened since',
			{ kind: 'recorded', via: 'online', row, order: summary('pos-open') },
			'partial',
			'reopened',
		],
		[
			'a record with a balance still due',
			{ kind: 'recorded', via: 'online', row, order: summary('pos-partial', '5.00') },
			'partial',
			'partial',
		],
		['a paid close', { kind: 'close', order: summary('completed') }, 'completed', 'completed'],
		[
			'a close the resident shows reopened',
			{ kind: 'close', order: summary('completed') },
			'not-completed',
			'reopened',
		],
		[
			'a close no refresh confirmed',
			{ kind: 'close', order: summary('completed') },
			'unconfirmed',
			'unconfirmed',
		],
		[
			'a send whose order is open again',
			{ kind: 'sent', order: summary('pos-open'), stamp },
			'not-completed',
			'not-completed',
		],
		[
			'a settled sale the resident shows open',
			{ kind: 'settled', order: summary('pending') },
			'not-completed',
			'not-completed',
		],
	] as const)('%s lands as %s → %s', async (_, answer, finished, result) => {
		const finish = jest.fn(async () => finished);
		const resolveAttempt = jest.fn(async () => undefined);
		const landed = await landAnswer(answer as StoreAnswer, press, {
			finish,
			resolveAttempt,
			dp: 2,
		});
		expect(landed).toBe(result);
		expect(finish).toHaveBeenCalledTimes(1);
		expect(resolveAttempt).not.toHaveBeenCalled();
	});

	it('a reopened answer finishes nothing and resolves the completion attempt', async () => {
		const finish = jest.fn();
		const resolveAttempt = jest.fn(async () => undefined);
		const answer = { kind: 'reopened', order: summary('pos-open') } as const;
		const landed = await landAnswer(answer, press, { finish, resolveAttempt, dp: 2 });
		expect(landed).toBe('reopened');
		expect(finish).not.toHaveBeenCalled();
		expect(resolveAttempt).toHaveBeenCalledTimes(1);
	});

	it('a copy that failed to save completes as a failed mirror', async () => {
		const finish = jest.fn(async () => 'partial' as const);
		const notMirrored = { cause: new Error('disk') };
		const answer = { kind: 'recorded', via: 'online', row, order: null } as const;
		const landed = await landAnswer(answer, press, {
			finish,
			resolveAttempt: jest.fn(),
			dp: 2,
			notMirrored,
		});
		expect(finish).toHaveBeenCalledWith(expect.objectContaining({ mirrorFailed: true }));
		expect(landed).toBe('partial');
	});
});

// Try again: a replayed answer arrives mirrored; answerOf only reads it.
describe('answerOf', () => {
	const resident = (meta_data: unknown[] = []) => ({ meta_data }) as never;
	const awaiting = [{ key: '_wcpos_awaiting_customer', value: stamp }];
	it.each([
		[
			'a record',
			'record',
			{ payment: row, order: summary('completed') },
			[],
			{ kind: 'recorded', via: 'online', row, order: summary('completed') },
		],
		[
			'a submit recorded',
			'submit',
			{ outcome: 'recorded', payment: row, order: summary('completed') },
			[],
			{ kind: 'recorded', via: 'online', row, order: summary('completed') },
		],
		[
			// #2900 (c5-2): the resolver minted the attempt's row; its id is the attempt id.
			'a submit replay recorded with the row the resolver minted',
			'submit',
			{ outcome: 'recorded', payment: minted, order: summary('completed') },
			[],
			{ kind: 'recorded', via: 'online', row: minted, order: summary('completed') },
		],
		[
			'a submit sent, the resident stamped',
			'submit',
			{ outcome: 'sent', order: summary('pending') },
			awaiting,
			{ kind: 'sent', order: summary('pending'), stamp },
		],
		[
			'a submit sent, the stamp gone',
			'submit',
			{ outcome: 'sent', order: summary('pending') },
			[],
			null,
		],
		[
			'a submit paid, still paid',
			'submit',
			{ outcome: 'paid', order: summary('completed') },
			[],
			{ kind: 'settled', order: summary('completed') },
		],
		[
			'a submit paid, reopened since',
			'submit',
			{ outcome: 'paid', order: summary('pos-open') },
			[],
			{ kind: 'reopened', order: summary('pos-open') },
		],
		[
			'a submit settled at pending',
			'submit',
			{ outcome: 'settled', order: summary('pending') },
			[],
			{ kind: 'settled', order: summary('pending') },
		],
		[
			'a submit settled, reopened since',
			'submit',
			{ outcome: 'settled', order: summary('pos-partial') },
			[],
			{ kind: 'reopened', order: summary('pos-partial') },
		],
		[
			'a close',
			'close',
			{ order: summary('completed') },
			[],
			{ kind: 'close', order: summary('completed') },
		],
		['a cancel', 'cancel', { order: summary('pos-open') }, [], null],
	] as const)('%s', (_, kind, data, meta, answer) =>
		expect(answerOf({ kind, data }, resident([...meta]))).toEqual(answer)
	);
});

// The bridge: a recovered send lands with no press prediction (ADR 0040 Decided 1 rule 3).
describe('recovery', () => {
	it('lands a recovered send as a sent sale, without resolving the attempt itself', async () => {
		const finish = jest.fn(async () => 'completed' as const);
		const resolveAttempt = jest.fn(async () => undefined);
		const sent = { kind: 'sent', order: summary('pending'), stamp } as const;
		await expect(
			landAnswer(sent, { via: 'recovery' }, { finish, resolveAttempt, dp: 2 })
		).resolves.toBe('completed');
		expect(finish).toHaveBeenCalledWith({ source: 'gateway', order: summary('pending'), stamp });
		expect(resolveAttempt).not.toHaveBeenCalled();
	});

	it('a recorded answer in a recovery carries no press prediction', () => {
		const recorded = {
			kind: 'recorded',
			via: 'online',
			row,
			order: summary('pos-partial'),
		} as const;
		expect(saleOutcomeOf(recorded, { via: 'recovery' }, false)).toEqual({
			source: 'manual',
			via: 'online',
			row,
			order: summary('pos-partial'),
			mirrorFailed: false,
			remainingMinor: null,
		});
	});

	it.each([
		['a close completed', 'close', { order: summary('completed') }, true],
		[
			'a terminal capture with a completed summary',
			'capture',
			{ payment: row, order: summary('completed') },
			true,
		],
		[
			'a submit sent, summary pending',
			'submit',
			{ outcome: 'sent', order: summary('pending') },
			false,
		],
		['a record, summary pos-open', 'record', { payment: row, order: summary('pos-open') }, false],
		['a refund, row only', 'refund', { payment: row }, false],
	] as const)('answerReadsPaid: %s', (_, kind, data, paid) =>
		expect(answerReadsPaid({ kind, data } as never)).toBe(paid)
	);
});
