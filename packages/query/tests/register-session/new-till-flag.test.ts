import {
	disarmNewTillOnNextLoad,
	NEW_TILL_ON_NEXT_LOAD_KEY,
	newTillOnNextLoadArmed,
} from '../../src/register-session/new-till-flag';

afterEach(() => {
	localStorage.clear();
});

it('is off by default', () => {
	expect(newTillOnNextLoadArmed()).toBe(false);
});

it('stays armed until disarmed, so a failed re-mint is retried on the next load', () => {
	localStorage.setItem(NEW_TILL_ON_NEXT_LOAD_KEY, '1');
	expect(newTillOnNextLoadArmed()).toBe(true);
	expect(newTillOnNextLoadArmed()).toBe(true);
	disarmNewTillOnNextLoad();
	expect(localStorage.getItem(NEW_TILL_ON_NEXT_LOAD_KEY)).toBeNull();
	expect(newTillOnNextLoadArmed()).toBe(false);
});

it('ignores any value but "1"', () => {
	localStorage.setItem(NEW_TILL_ON_NEXT_LOAD_KEY, 'true');
	expect(newTillOnNextLoadArmed()).toBe(false);
});

it('is a no-op where storage is missing or throws (native, sandboxed embeds)', () => {
	const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
	try {
		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			get() {
				throw new DOMException('denied', 'SecurityError');
			},
		});
		expect(newTillOnNextLoadArmed()).toBe(false);
		expect(() => disarmNewTillOnNextLoad()).not.toThrow();
		Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: undefined });
		expect(newTillOnNextLoadArmed()).toBe(false);
		expect(() => disarmNewTillOnNextLoad()).not.toThrow();
	} finally {
		if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
	}
});
