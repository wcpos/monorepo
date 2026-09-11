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
it('shows register and store for three registers', () => {
	expect(describeRegisterBar({ ...base, registerCount: 3 }).place).toBe('Front · Shop');
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
