import { createPermissionsRefreshGate, REFUSED_RETRY_MS } from './gate';

const first = { kind: 'stamp', stamp: '0123456789abcdef' } as const;
const second = { kind: 'stamp', stamp: 'fedcba9876543210' } as const;
const refused = { kind: 'refused' } as const;
let time = 0;
const makeGate = () => createPermissionsRefreshGate({ now: () => time });

beforeEach(() => {
	time = 0;
});

it('(a) keeps one read in flight until it settles', () => {
	const gate = makeGate();
	expect(gate.shouldRead(first)).toBe(true);
	time += REFUSED_RETRY_MS;
	expect(gate.shouldRead(second)).toBe(false);
	expect(gate.shouldRead(refused)).toBe(false);
	gate.settled({ ok: true });
	expect(gate.shouldRead(second)).toBe(true);
});

it('(b) reads the first stamp and then only a different held stamp', () => {
	const gate = makeGate();
	expect(gate.shouldRead(first)).toBe(true);
	gate.settled({ ok: true });
	expect(gate.shouldRead(first)).toBe(false);
	expect(gate.shouldRead(second)).toBe(true);
});

it('(c) rate limits refusals from the last read start, including a stamp read', () => {
	const gate = createPermissionsRefreshGate({ now: () => time, retryAfterMs: 100 });
	expect(gate.shouldRead(first)).toBe(true);
	time = 50;
	gate.settled({ ok: true });
	time = 99;
	expect(gate.shouldRead(refused)).toBe(false);
	time = 100;
	expect(gate.shouldRead(refused)).toBe(true);
	gate.settled({ ok: true });
	time = 199;
	expect(gate.shouldRead(refused)).toBe(false);
	time = 200;
	expect(gate.shouldRead(refused)).toBe(true);
});

it('(d) holds the triggering stamp on success and keeps it after a refusal read', () => {
	const gate = makeGate();
	gate.shouldRead(first);
	gate.settled({ ok: true });
	expect(gate.shouldRead(first)).toBe(false);
	time = REFUSED_RETRY_MS;
	expect(gate.shouldRead(refused)).toBe(true);
	gate.settled({ ok: true });
	expect(gate.shouldRead(first)).toBe(false);
	expect(gate.shouldRead(second)).toBe(true);
});

it('(e) holds a failed stamp but permits a new stamp or a later refusal', () => {
	const gate = makeGate();
	gate.shouldRead(first);
	gate.settled({ ok: false });
	expect(gate.shouldRead(first)).toBe(false);
	expect(gate.shouldRead(second)).toBe(true);
	gate.settled({ ok: false });
	expect(gate.shouldRead(second)).toBe(false);
	time = REFUSED_RETRY_MS;
	expect(gate.shouldRead(refused)).toBe(true);
	gate.settled({ ok: false });
	expect(gate.shouldRead(second)).toBe(false);
});

it('(f) resets the held stamp and refusal window without releasing an active read', () => {
	const gate = makeGate();
	gate.shouldRead(first);
	gate.reset();
	expect(gate.shouldRead(second)).toBe(false);
	gate.settled({ ok: false });
	gate.reset();
	expect(gate.shouldRead(first)).toBe(true);
	gate.settled({ ok: true });
	expect(gate.shouldRead(refused)).toBe(false);
	gate.reset();
	expect(gate.shouldRead(refused)).toBe(true);
});
