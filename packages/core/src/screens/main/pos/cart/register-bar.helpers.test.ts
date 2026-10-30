import { describeRegisterBar } from './register-bar.helpers';

const base = {
	registerName: 'Front',
	registerCount: 1,
	storeName: 'Shop',
	bindingStatus: 'bound' as const,
	online: true,
};
it('shows only the store for one register', () => {
	expect(describeRegisterBar(base)).toEqual({ place: 'Shop', pill: null });
});
it('shows store then register for three registers', () => {
	expect(describeRegisterBar({ ...base, registerCount: 3 }).place).toBe('Shop · Front');
});
it('asks for a register', () => {
	expect(describeRegisterBar({ ...base, bindingStatus: 'choose' }).pill).toBe(
		'register.choose_register'
	);
});
it('shows offline', () => {
	expect(describeRegisterBar({ ...base, online: false }).pill).toBe('register.offline');
});
it('prioritises choosing over offline', () => {
	expect(describeRegisterBar({ ...base, bindingStatus: 'choose', online: false }).pill).toBe(
		'register.choose_register'
	);
});
it.each([
	[{ sessionsOn: true, sessionStatus: null }, 'register.closed'],
	[{ sessionsOn: true, sessionStatus: 'open', overdue: true }, 'register.overdue'],
	[{ sessionsOn: true, sessionStatus: 'counting', overdue: true }, 'register.counting'],
	[{ sessionsOn: true, sessionStatus: 'counting', online: false }, 'register.offline'],
	[
		{ sessionsOn: true, sessionStatus: 'counting', online: false, bindingStatus: 'choose' },
		'register.choose_register',
	],
	[{ sessionsOn: false, sessionStatus: null }, null],
] as const)('session pill priority %j', (state, pill) => {
	expect(describeRegisterBar({ ...base, ...state }).pill).toBe(pill);
});

it('shows approval needed on a refused counting session', () => {
	expect(
		describeRegisterBar({ ...base, sessionStatus: 'counting', approvalRequired: true }).pill
	).toBe('register.approval_needed');
});

it.each([
	[{ bindingStatus: 'none' }, 'register.no_register'],
	[{ bindingStatus: 'none', online: false }, 'register.no_register'],
	[{ bindingStatus: 'unknown', directoryFailed: true }, 'register.offline'],
] as const)('directory pill priority %j', (state, pill) => {
	expect(describeRegisterBar({ ...base, ...state }).pill).toBe(pill);
});

// ADR 0040 Decided 1 rule 1: the bar counts the sales the store has still to hear.
it.each([
	[{ online: true, awaitingStore: 0 }, null],
	[{ online: false, awaitingStore: 0 }, 'register.offline'],
	[{ online: false, awaitingStore: 2 }, 'register.offline_to_send'],
	[{ online: true, awaitingStore: 1 }, 'register.awaiting_store'],
	// Offline-to-send outranks every session pill; online awaiting ranks below them (no action).
	[
		{ online: false, awaitingStore: 1, sessionsOn: true, sessionStatus: 'counting' },
		'register.offline_to_send',
	],
	[{ awaitingStore: 1, sessionsOn: true, sessionStatus: 'counting' }, 'register.counting'],
	[
		{ awaitingStore: 1, sessionStatus: 'counting', approvalRequired: true },
		'register.approval_needed',
	],
	[
		{ awaitingStore: 1, sessionsOn: true, sessionStatus: 'open', overdue: true },
		'register.overdue',
	],
	[{ awaitingStore: 1, sessionsOn: true, sessionStatus: null }, 'register.closed'],
] as const)('awaiting-store pill %j', (state, pill) => {
	expect(describeRegisterBar({ ...base, ...state }).pill).toBe(pill);
});
