import { serialize } from 'node:v8';

import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import { countDecision, keptCount, mayAbandonCount } from './count-decision';

type Session = Parameters<typeof countDecision>[0];
type Movement = Parameters<typeof countDecision>[1]['movements'][number];

/** Expected cash 480.80; the cashier enters `cash` with nothing else on the drawer or session. */
const decide = ({
	cash = '480.80',
	others = {},
	session = {},
	movements = [],
	acknowledgedKey = '',
	figuresPending = false,
	refusedClose = false,
	blind = false,
	varianceThreshold = '',
	decimals = 2,
}: {
	cash?: string;
	others?: Record<string, string>;
	session?: Session;
	movements?: Movement[];
	acknowledgedKey?: string;
	figuresPending?: boolean;
	refusedClose?: boolean;
	blind?: boolean;
	varianceThreshold?: string;
	decimals?: number;
}) =>
	countDecision(
		session,
		{ expected: { cash: '480.80' }, movements, figuresPending, refusedClose },
		{ cash, others, decimals, acknowledgedKey },
		{ blind, varianceThreshold }
	);

describe('variance and the counted tenders', () => {
	it.each([
		['463.30', 2, -1750],
		['480.80', 2, 0],
		['483.80', 2, 300],
		['480.804', 3, 4],
	])('%s at %s places is %s minor units from 480.80', (cash, decimals, variance) => {
		expect(decide({ cash, decimals }).variance).toBe(variance);
	});

	it('sends cash and every other tender with an amount', () => {
		expect(decide({ others: { card: '22', cheque: '' } }).counted).toEqual({
			cash: '480.80',
			card: '22',
		});
	});
});

describe('manager approval', () => {
	it.each([
		['under the threshold', { cash: '478.80', varianceThreshold: '5' }, false, false],
		['over the threshold', { cash: '463.30', varianceThreshold: '5' }, true, true],
		['no threshold set', { cash: '463.30' }, false, false],
		[
			'a blind count over the threshold',
			{ cash: '463.30', varianceThreshold: '5', blind: true },
			false,
			false,
		],
		['an invalid count', { cash: '', varianceThreshold: '5' }, false, false],
		[
			'the store demanding it for an exact blind count',
			{ blind: true, session: { approval_required: true } },
			true,
			false,
		],
		[
			'an approved count the store normalised',
			{
				cash: '463.30',
				varianceThreshold: '5',
				session: { approval_required: true, approved_counted: { cash: '463.3000' } },
			},
			false,
			true,
		],
		[
			'a count changed after approval',
			{ session: { approved_counted: { cash: '463.30' } } },
			true,
			false,
		],
	] as const)('%s: approval %s, over-threshold fact %s', (_, input, approval, over) => {
		const decision = decide(input);
		expect(decision.approvalNeeded).toBe(approval);
		expect(decision.overThreshold).toBe(over);
		expect(decision.intent).toBe(approval ? 'approve' : 'close');
	});
});

describe('acknowledging cash the store refused (#3271)', () => {
	const refused = (id: string, amount: string | null = '20.0000') => ({
		id,
		amount,
		sync_status: 'failed',
	});
	it.each([
		['nothing refused', [{ id: 'm1', amount: '20.0000', sync_status: 'pending' }], null],
		['a refused no-sale moves no cash', [refused('m1', '0')], null],
		[
			'one refused row beside a synced one',
			[refused('m1'), { id: 'm2', amount: '5.0000', sync_status: 'synced' }],
			{ total: '20.0000', key: 'm1' },
		],
		[
			'two refused rows, keyed in id order',
			[refused('m2', '7.5000'), refused('m1')],
			{ total: '27.5000', key: 'm1,m2' },
		],
	])('%s', (_, movements, refusedCash) => {
		const decision = decide({ movements });
		expect(decision.refusedCash).toEqual(refusedCash);
		expect(decision.acknowledged).toBe(!refusedCash);
		expect(decision.closeAllowed).toBe(!refusedCash);
	});

	it('closes once the refused rows are acknowledged; a further refusal asks again', () => {
		expect(decide({ movements: [refused('m1')], acknowledgedKey: 'm1' }).closeAllowed).toBe(true);
		const further = decide({ movements: [refused('m1'), refused('m2')], acknowledgedKey: 'm1' });
		expect(further.acknowledged).toBe(false);
		expect(further.closeAllowed).toBe(false);
	});

	it('the tick does not skip the manager', () => {
		const decision = decide({
			cash: '463.30',
			varianceThreshold: '5',
			movements: [refused('m1')],
			acknowledgedKey: 'm1',
		});
		expect(decision.closeAllowed).toBe(true);
		expect(decision.intent).toBe('approve');
	});
});

describe('what Close may do', () => {
	it.each([
		['a valid count', {}, true],
		['a blank count', { cash: '' }, false],
		['a negative count', { cash: '-1' }, false],
		['figures still pending', { figuresPending: true }, false],
		['an invalid other tender', { others: { card: '1e2' } }, false],
		['a blank other tender', { others: { card: '' } }, true],
	] as const)('%s: %s', (_, input, allowed) => {
		expect(decide(input).closeAllowed).toBe(allowed);
	});

	it.each([
		['a refused close retries the kept count', { refusedClose: true }, 'retry'],
		[
			'a refused close over the threshold asks the manager first',
			{ refusedClose: true, cash: '463.30', varianceThreshold: '5' },
			'approve',
		],
		['a count closes', {}, 'close'],
	] as const)('%s', (_, input, intent) => {
		expect(decide(input).intent).toBe(intent);
	});
});

it.each([
	['counting', false, true],
	['counting', true, true],
	['open', true, false],
	['closed', true, true],
	['open', false, false],
	['closed', false, false],
])('leaving the count at %s (refused %s) abandons it: %s', (status, refused, result) => {
	expect(mayAbandonCount({ status }, refused)).toBe(result);
});

describe('keptCount: a refused close keeps its count (#2016, #3302)', () => {
	let db: RxDatabase;
	beforeEach(async () => {
		db = await createRxDatabase({
			name: `refused${Math.random().toString(36).slice(2)}`,
			storage: getRxStorageMemory(),
			multiInstance: false,
		});
		await db.addCollections({
			sessions: {
				schema: {
					version: 0,
					primaryKey: 'id',
					type: 'object',
					properties: {
						id: { type: 'string', maxLength: 36 },
						counted: { type: 'object' },
						count_note: { type: ['string', 'null'] },
						count_denominations: { type: ['array', 'null'] },
					},
					required: ['id'],
				},
			},
		});
	});
	afterEach(() => db.remove());

	// The live till (#2016): the session document read from the store, counting with its count, and
	// a closure row of the same id. The count pane sends what keptCount gives it to the storage
	// worker by postMessage, which clones as v8.serialize does and refuses an RxDB Proxy
	// (DataCloneError).
	it('keeps the count of a session document as a close the storage worker can clone', async () => {
		const session = await db.sessions.insert({ id: 's', counted: { cash: '40.00' } });
		const closure = {
			id: 's',
			counted: { cash: '40.00' },
			breakdowns: {
				variance_note: 'Short',
				denominations: [{ value: '20', pieces: 2, amount: '40' }],
			},
		};
		const kept = keptCount(session, closure);
		expect(() => serialize(kept)).not.toThrow();
		expect(kept).toEqual({
			counted: { cash: '40.00' },
			note: 'Short',
			denominations: [{ value: '20', pieces: 2 }],
		});
	});

	it('takes the count from the closure row when the session has none', async () => {
		const session = await db.sessions.insert({ id: 's', counted: {} });
		const kept = keptCount(session, { id: 's', counted: { cash: '40.00' } });
		expect(() => serialize(kept)).not.toThrow();
		expect(kept).toEqual({ counted: { cash: '40.00' }, note: '', denominations: [] });
	});

	// An interrupted retry (#3302): closeSession saved the corrected count, note and denominations
	// on the session; writeClosure never rewrote the closure row.
	const staleClosure = () => ({
		id: 's',
		counted: { cash: '40.00' },
		breakdowns: { variance_note: 'Short', denominations: [{ value: '20', pieces: 2 }] },
	});
	it('keptCount prefers the corrected note and denominations an interrupted retry saved', async () => {
		const session = await db.sessions.insert({
			id: 's',
			counted: { cash: '60.00' },
			count_note: 'Found a twenty',
			count_denominations: [{ value: '20', pieces: 3 }],
		});
		const kept = keptCount(session, staleClosure());
		expect(() => serialize(kept)).not.toThrow();
		expect(kept).toEqual({
			counted: { cash: '60.00' },
			note: 'Found a twenty',
			denominations: [{ value: '20', pieces: 3 }],
		});
		const denominations = [{ value: '20', pieces: 3 }];
		const corrected = { id: 's', counted: { cash: '60.00' }, count_denominations: denominations };
		const plain = keptCount(corrected, staleClosure());
		expect(plain.denominations).toEqual(denominations);
		expect(plain.denominations).not.toBe(denominations);
	});
	it.each([
		['emptied', '', []],
		['cleared', null, null],
	])(
		'keptCount falls back to the closure row for an %s note and denominations',
		(_, note, pieces) => {
			const closure = staleClosure();
			const emptied = {
				id: 's',
				counted: { cash: '40.00' },
				count_note: note,
				count_denominations: pieces,
			};
			const kept = keptCount(emptied, closure);
			expect(kept).toEqual({
				counted: { cash: '40.00' },
				note: 'Short',
				denominations: [{ value: '20', pieces: 2 }],
			});
			expect(kept.denominations).not.toBe(closure.breakdowns.denominations);
		}
	);

	it('keeps only the count when the closure row is another session’s', () => {
		const kept = keptCount(
			{ id: 's', counted: { cash: '40.00' } },
			{ ...staleClosure(), id: 'other' }
		);
		expect(kept).toEqual({ counted: { cash: '40.00' } });
	});
});
