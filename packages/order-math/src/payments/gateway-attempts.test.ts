import {
	GATEWAY_ATTEMPTS_META_KEY,
	readGatewayAttempts,
	withGatewayAttempt,
	withSupersededAttempts,
} from './gateway-attempts';
import { withLedger } from './ledger';

import type { PaymentRow } from './types';

const entry = (overrides: Record<string, unknown> = {}) => ({
	fate: 'sent',
	method_id: 'custom_gateway',
	cashier_id: 7,
	origin: null,
	command_id: 'c',
	sent_at_gmt: '2026-10-23T10:42:00Z',
	resolved_at_gmt: null,
	awaiting: null,
	asks: 0,
	attention_at_gmt: null,
	...overrides,
});
const asString = (attempts: Record<string, unknown>, schema = 1) => [
	{ key: GATEWAY_ATTEMPTS_META_KEY, value: JSON.stringify({ schema, attempts }) },
];
const asObject = (attempts: Record<string, unknown>) => [
	{ key: GATEWAY_ATTEMPTS_META_KEY, value: { schema: 1, attempts } },
];
const attempt = (id: string, overrides: Record<string, unknown> = {}) => ({
	id,
	methodId: 'custom_gateway',
	cashierId: 7,
	sentAtGmt: '2026-10-23T10:42:00Z',
	awaiting: null,
	flagged: false,
	...overrides,
});

describe('readGatewayAttempts', () => {
	it.each([
		['a JSON string', asString],
		['an object', asObject],
	])('reads schema 1 as %s', (_, build) => {
		expect(readGatewayAttempts(build({ a: entry() }))).toEqual({
			awaiting: null,
			unanswered: attempt('a'),
		});
	});
	it('the newest sent attempt nobody awaits is unanswered; an awaited one never is', () => {
		const awaited = entry({ awaiting: { destination: 'x@y.z', at_gmt: '2026-10-23T10:50:00Z' } });
		const meta = asString({ old: entry(), mid: entry(), late: awaited });
		const read = readGatewayAttempts(meta);
		expect(read.unanswered?.id).toBe('mid');
		expect(read.awaiting).toEqual(
			attempt('late', { awaiting: { destination: 'x@y.z', atGmt: '2026-10-23T10:50:00Z' } })
		);
		expect(readGatewayAttempts(asString({ late: awaited })).unanswered).toBeNull();
	});
	it('a paid attempt is unanswered until the ledger holds its row', () => {
		const meta = asString({ 'Attempt-P': entry({ fate: 'paid' }) });
		expect(readGatewayAttempts(meta).unanswered?.id).toBe('Attempt-P');
		const row = { id: 'attempt-p', status: 'captured' } as PaymentRow;
		expect(readGatewayAttempts(withLedger(meta, [row])).unanswered).toBeNull();
	});
	it.each(['cancelled', 'superseded', 'settled'])('a %s attempt is never unanswered', (fate) => {
		expect(readGatewayAttempts(asString({ a: entry({ fate }) })).unanswered).toBeNull();
	});
	it.each([
		['missing', { method_id: undefined }],
		['empty', { method_id: '' }],
		['not a string', { method_id: 7 }],
	])('an entry whose method_id is %s is neither awaiting nor unanswered', (_, overrides) => {
		const awaiting = { destination: null, at_gmt: '2026-10-23T10:50:00Z' };
		const meta = asString({
			a: entry({ ...overrides, awaiting }),
			b: entry(overrides),
			p: entry({ ...overrides, fate: 'paid' }),
		});
		expect(readGatewayAttempts(meta)).toEqual({ awaiting: null, unanswered: null });
	});
	it('flagged comes from attention_at_gmt', () => {
		const meta = asString({ a: entry({ attention_at_gmt: '2026-10-23T11:00:00Z', asks: 3 }) });
		expect(readGatewayAttempts(meta).unanswered?.flagged).toBe(true);
	});
	it.each([
		['schema 2', asString({ a: entry() }, 2)],
		['garbage', [{ key: GATEWAY_ATTEMPTS_META_KEY, value: '{not json' }]],
		['an attempts list', [{ key: GATEWAY_ATTEMPTS_META_KEY, value: { schema: 1, attempts: [] } }]],
		['a missing key', [{ key: 'other', value: 1 }]],
		['no meta', undefined],
	])('%s reads as nothing', (_, meta) => {
		expect(readGatewayAttempts(meta)).toEqual({ awaiting: null, unanswered: null });
	});
});

describe('withGatewayAttempt', () => {
	it('creates the map with schema 1 when missing, as an object', () => {
		expect(withGatewayAttempt([{ key: 'other', value: 1 }], 'a', { fate: 'cancelled' })).toEqual([
			{ key: 'other', value: 1 },
			{
				key: GATEWAY_ATTEMPTS_META_KEY,
				value: { schema: 1, attempts: { a: { fate: 'cancelled' } } },
			},
		]);
	});
	it('merges into an entry, keeps the others and the string form', () => {
		const meta = withGatewayAttempt(asString({ a: entry(), b: entry() }), 'a', {
			fate: 'cancelled',
		});
		expect(typeof meta[0].value).toBe('string');
		expect(JSON.parse(meta[0].value as string)).toEqual({
			schema: 1,
			attempts: { a: entry({ fate: 'cancelled' }), b: entry() },
		});
		expect(readGatewayAttempts(meta).unanswered?.id).toBe('b');
	});
	it('a map that is not schema 1 starts fresh, as the reader ignores it', () => {
		const meta = withGatewayAttempt(asString({ old: entry() }, 2), 'a', { fate: 'cancelled' });
		expect(JSON.parse(meta[0].value as string)).toEqual({
			schema: 1,
			attempts: { a: { fate: 'cancelled' } },
		});
	});
});

describe('withSupersededAttempts', () => {
	const awaiting = { destination: 'x@y.z', at_gmt: '2026-10-23T10:50:00Z' };
	const fates = (meta: readonly { key?: string; value?: unknown }[]) =>
		Object.fromEntries(
			Object.entries(
				(JSON.parse(meta[0].value as string) as { attempts: Record<string, { fate: string }> })
					.attempts
			).map(([id, { fate }]) => [id, fate])
		);
	const meta = asString({
		stranded: entry(),
		awaited: entry({ awaiting }),
		cancelled: entry({ fate: 'cancelled' }),
		paid: entry({ fate: 'paid' }),
		Keep: entry(),
	});

	it("'sent' supersedes every other sent attempt, stranded or awaited, never keepId or a resolved one", () => {
		const next = withSupersededAttempts(meta, 'keep', 'sent');
		expect(fates(next)).toEqual({
			stranded: 'superseded',
			awaited: 'superseded',
			cancelled: 'cancelled',
			paid: 'paid',
			Keep: 'sent',
		});
		expect(readGatewayAttempts(next).awaiting).toBeNull();
		expect(readGatewayAttempts(next).unanswered?.id).toBe('Keep');
	});
	it("'awaiting' supersedes only the awaited ones: a stranded sent beside a payment stays", () => {
		const next = withSupersededAttempts(meta, 'keep', 'awaiting');
		expect(fates(next)).toEqual({
			stranded: 'sent',
			awaited: 'superseded',
			cancelled: 'cancelled',
			paid: 'paid',
			Keep: 'sent',
		});
		expect(
			readGatewayAttempts(withSupersededAttempts(meta, 'stranded', 'awaiting')).unanswered?.id
		).toBe('Keep');
	});
	it('returns the same meta when nothing matches', () => {
		const resolved = asString({ a: entry({ fate: 'cancelled' }), b: entry({ awaiting: null }) });
		expect(withSupersededAttempts(resolved, 'b', 'sent')).toBe(resolved);
		const stranded = asString({ a: entry() });
		expect(withSupersededAttempts(stranded, 'x', 'awaiting')).toBe(stranded);
	});
});
