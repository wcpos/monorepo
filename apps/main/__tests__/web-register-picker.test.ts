import { closeOpenRegisterSessions, type SessionTransport } from '../e2e/register-session-cleanup';
import {
	assertStillBound,
	boundRegister,
	createRegisterReadRecorder,
	DOCS_REGISTER_PREFIX,
	isSuiteRegister,
	registerIdOf,
	suiteRegisterRowIndex,
} from '../e2e/suite-register';

jest.mock('@wcpos/utils/logger', () => ({ log: { info: jest.fn(), warn: jest.fn() } }));

// Reset at module scope to avoid jest-expo's winter-runtime "require outside test scope" error.
jest.resetModules();

/** dev-pro store 24128 (run 43121066216): the suite's register and ui-climb's. */
const SUITE = { id: 'aa11bb22-0000-4000-8000-000000000001', name: 'Register' };
const CLIMB = { id: '40b9db3b-562e-451c-b6d5-39c6d4ff768f', name: 'Climb Register' };
/** The two picker rows' text in the failure snapshot: the name line, then the status badge. */
const SUITE_ROW = 'Register\nAbierta desde 10:11 PM · Demo Cashier';
const CLIMB_ROW = 'Climb Register\nAbierta desde 10:17 PM · e2e-cashier-2';

describe('isSuiteRegister', () => {
	it('is the register named exactly "Register"', () => {
		expect(isSuiteRegister(SUITE)).toBe(true);
	});

	it('refuses every other name: no prefix, substring, trim or case folding', () => {
		// ui-climb's register: "Register" is only its suffix.
		expect(isSuiteRegister(CLIMB)).toBe(false);
		// A second suite-looking register is still not the one the suite created.
		expect(isSuiteRegister({ id: 'x', name: 'Register 2' })).toBe(false);
		// Leading whitespace is a different name, not the suite's with a typo forgiven.
		expect(isSuiteRegister({ id: 'x', name: ' Register' })).toBe(false);
		// Names are case-sensitive.
		expect(isSuiteRegister({ id: 'x', name: 'register' })).toBe(false);
	});

	it('is the docs register by its id prefix, whatever its name', () => {
		expect(isSuiteRegister({ id: `${DOCS_REGISTER_PREFIX}-1111`, name: 'Front till' })).toBe(true);
		// The prefix is an id rule: a register NAMED after it is not the docs register.
		expect(isSuiteRegister({ id: 'x', name: DOCS_REGISTER_PREFIX })).toBe(false);
	});
});

describe('suiteRegisterRowIndex', () => {
	it('selects the suite row and never the climb row, in either order', () => {
		expect(suiteRegisterRowIndex([SUITE_ROW, CLIMB_ROW])).toBe(0);
		expect(suiteRegisterRowIndex([CLIMB_ROW, SUITE_ROW])).toBe(1);
	});

	it('fails naming the rows it saw when the suite register is absent', () => {
		expect(() => suiteRegisterRowIndex([CLIMB_ROW, 'Register 2\nCerrada'])).toThrow(
			/no register named "Register".*"Climb Register", "Register 2"/
		);
	});
});

describe('register read regressions', () => {
	it('D1: another store list must not identify the bound climb register as SUITE', async () => {
		const recorder = createRegisterReadRecorder();
		recorder.observe('/wcpos/v2/registers', async () => [CLIMB]);
		await recorder.settled();
		recorder.observe('/wcpos/v2/registers', async () => [SUITE]);
		await recorder.settled();
		expect(boundRegister(CLIMB.id, recorder.current().names)).toEqual(CLIMB);
	});

	it('D2: follows an in-page store switch and refuses a previously decided id', async () => {
		const recorder = createRegisterReadRecorder();
		const SUITE_A = SUITE;
		const SUITE_B = { ...SUITE, id: '0f000000-0000-4000-8000-000000000002' };
		const CLIMB_B = CLIMB;
		recorder.observe('/wcpos/v2/registers', async () => [SUITE_A]);
		await recorder.settled();
		recorder.observe('/wcpos/v2/registers', async () => [CLIMB_B, SUITE_B]);
		await recorder.settled();
		expect(boundRegister(SUITE_B.id, recorder.current().names)).toEqual(SUITE_B);
		expect(() => assertStillBound(SUITE_A.id, SUITE_B.id)).toThrow(
			`[register] the bar changed register before the session opened: decided "${SUITE_A.id}", now "${SUITE_B.id}"`
		);
		expect(() => assertStillBound(SUITE_B.id, SUITE_B.id)).not.toThrow();
	});

	it('F1: keeps all names after a rejected list and follows the id read by a single', async () => {
		const recorder = createRegisterReadRecorder();
		recorder.observe('/wcpos/v2/registers', async () => [SUITE]);
		await recorder.settled();
		recorder.observe('/wcpos/v2/registers', () => Promise.reject(new Error('unavailable')));
		recorder.observe(`/wcpos/v2/registers/${CLIMB.id}`, async () => CLIMB);
		await recorder.settled();
		expect(boundRegister(CLIMB.id, recorder.current().names)).toEqual(CLIMB);
		expect(boundRegister(SUITE.id, recorder.current().names)).toEqual(SUITE);
	});

	it.each([
		[CLIMB, SUITE],
		[SUITE, CLIMB],
	])('F2/F3: follows only the bar id after single reads of %s then %s', async (first, second) => {
		const recorder = createRegisterReadRecorder();
		recorder.observe('/wcpos/v2/registers', async () => [SUITE, CLIMB]);
		await recorder.settled();
		for (const row of [first, second]) {
			recorder.observe(`/wcpos/v2/registers/${row.id}`, async () => row);
			await recorder.settled();
		}
		expect(boundRegister(CLIMB.id, recorder.current().names)).toEqual(CLIMB);
		expect(boundRegister(SUITE.id, recorder.current().names)).toEqual(SUITE);
	});
});

describe('createRegisterReadRecorder', () => {
	it('F5: ignores health without reading its body', async () => {
		const recorder = createRegisterReadRecorder();
		const body = jest.fn(async () => CLIMB);
		recorder.observe('/wcpos/v2/registers/health', body);
		await recorder.settled();
		expect(body).not.toHaveBeenCalled();
		expect(recorder.current()).toEqual({ names: new Map(), smallList: false });
	});

	it('T1: keeps names when response.json() rejects (run 43172345446)', async () => {
		const recorder = createRegisterReadRecorder();
		recorder.observe('/wcpos/v2/registers', async () => [SUITE, CLIMB]);
		await recorder.settled();
		const body = () => Promise.reject(new Error('response body unavailable'));
		recorder.observe('/wcpos/v2/registers', body);
		recorder.observe(`/wcpos/v2/registers/${SUITE.id}`, body);
		await recorder.settled();
		expect(recorder.current()).toEqual({
			names: new Map([SUITE, CLIMB].map(({ id, name }) => [id, name])),
			smallList: false,
		});
	});

	it('T2: records a one-row list resolving after a rejected list', async () => {
		const recorder = createRegisterReadRecorder();
		recorder.observe('/wcpos/v2/registers', () => Promise.reject(new Error('unavailable')));
		await recorder.settled();
		expect(recorder.current()).toEqual({ names: new Map(), smallList: false });
		recorder.observe('/wcpos/v2/registers', async () => [SUITE]);
		await recorder.settled();
		expect(recorder.current()).toEqual({
			names: new Map([[SUITE.id, SUITE.name]]),
			smallList: true,
		});
	});

	it('T3: skips a non-array list and rows without string ids and names', async () => {
		const recorder = createRegisterReadRecorder();
		recorder.observe('/wcpos/v2/registers', async () => ({ code: 'x' }));
		await recorder.settled();
		expect(recorder.current()).toEqual({ names: new Map(), smallList: false });
		recorder.observe('/wcpos/v2/registers', async () => [
			null,
			{},
			{ id: 1, name: 'bad' },
			{ id: 'bad', name: 1 },
			SUITE,
		]);
		await recorder.settled();
		expect(recorder.current()).toEqual({
			names: new Map([[SUITE.id, SUITE.name]]),
			smallList: false,
		});
	});

	it.each([`/wcpos/v2/registers/${SUITE.id}/sessions`, '/wcpos/v2/sessions'])(
		'T4: ignores %s without reading its body',
		async (route) => {
			const recorder = createRegisterReadRecorder();
			const body = jest.fn();
			recorder.observe(route, body);
			await recorder.settled();
			expect(recorder.current()).toEqual({ names: new Map(), smallList: false });
			expect(body).not.toHaveBeenCalled();
		}
	);
});

describe('boundRegister', () => {
	const names = new Map([[SUITE.id, SUITE.name]]);
	it.each([null, undefined, '', 'Register', '944ef7dc'])(
		'D3: refuses an unbound or malformed bar attribute %s',
		(attribute) => {
			expect(registerIdOf(attribute)).toBeNull();
			expect(boundRegister(attribute, names)).toBeNull();
		}
	);
	it('D3: accepts an upper-case UUID unchanged', () => {
		expect(registerIdOf(SUITE.id.toUpperCase())).toBe(SUITE.id.toUpperCase());
	});
	it.each([CLIMB.id, '944ef7dc-0000-4000-8000-000000000001'])(
		'D4: refuses a valid id whose name was never read, including docs: %s',
		(id) => {
			expect(boundRegister(id, names)).toBeNull();
		}
	);
});

describe('closeOpenRegisterSessions across registers', () => {
	const NOW = Date.parse('2026-11-12T12:00:00Z');
	const E2E_ID = 42;
	const HUMAN_ID = 1;
	const gmt = (msAgo: number) => new Date(NOW - msAgo).toISOString().slice(0, 19).replace('T', ' ');
	const TEN_MINUTES = 10 * 60 * 1000;
	const THREE_HOURS = 3 * 60 * 60 * 1000;

	function store(rows: { id: string; register: typeof SUITE; by: number; ago: number }[]) {
		const posts: string[] = [];
		const registers = new Map([SUITE, CLIMB].map((row) => [row.id, row]));
		const transport: SessionTransport = {
			get: async (route, params) => {
				if (route === 'wp/v2/users')
					return { status: 200, body: [{ id: E2E_ID, slug: 'e2e-cashier-2' }] };
				if (route === 'wcpos/v2/sessions')
					return {
						status: 200,
						body: rows
							.filter(() => params?.status === 'open')
							.map((row) => ({
								id: row.id,
								register_id: row.register.id,
								status: 'open',
								opened_by: row.by,
								opened_at_gmt: gmt(row.ago),
							})),
					};
				const register = /^wcpos\/v2\/registers\/(.+)$/.exec(route);
				if (register) {
					const row = registers.get(register[1]);
					return row ? { status: 200, body: row } : { status: 404, body: null };
				}
				if (route.startsWith('wcpos/v2/sessions/'))
					return { status: 200, body: { expected: { cash: '10.0000' } } };
				return { status: 404, body: null };
			},
			post: async (route) => {
				posts.push(route);
				return { status: 200, body: {} };
			},
		};
		return { transport, posts };
	}

	const close = (transport: SessionTransport) =>
		closeOpenRegisterSessions(transport, ['e2e-cashier-2'], NOW);

	it('closes a 10-minute-old E2E session on the climb register: no run sells there', async () => {
		const { transport } = store([{ id: 'stray', register: CLIMB, by: E2E_ID, ago: TEN_MINUTES }]);
		expect((await close(transport)).closed).toEqual(['stray']);
	});

	it('leaves a 10-minute-old E2E session on "Register": a concurrent run may be selling', async () => {
		const { transport, posts } = store([
			{ id: 'live', register: SUITE, by: E2E_ID, ago: TEN_MINUTES },
		]);
		expect((await close(transport)).closed).toEqual([]);
		expect(posts).toEqual([]);
	});

	it('never closes a session a non-E2E user opened, on any register or age', async () => {
		const { transport, posts } = store([
			{ id: 'h1', register: CLIMB, by: HUMAN_ID, ago: TEN_MINUTES },
			{ id: 'h2', register: CLIMB, by: HUMAN_ID, ago: THREE_HOURS },
			{ id: 'h3', register: SUITE, by: HUMAN_ID, ago: THREE_HOURS },
		]);
		expect((await close(transport)).closed).toEqual([]);
		expect(posts).toEqual([]);
	});

	it('closes a 3-hour-old E2E session on "Register", as before', async () => {
		const { transport } = store([{ id: 'stale', register: SUITE, by: E2E_ID, ago: THREE_HOURS }]);
		expect((await close(transport)).closed).toEqual(['stale']);
	});
});
