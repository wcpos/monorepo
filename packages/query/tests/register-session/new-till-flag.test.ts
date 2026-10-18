import {
	consumeNewTillOnNextLoad,
	NEW_TILL_ON_NEXT_LOAD_KEY,
} from '../../src/register-session/new-till-flag';

afterEach(() => {
	localStorage.clear();
});

it('is off by default', () => {
	expect(consumeNewTillOnNextLoad()).toBe(false);
});

it('fires once per armed load and clears itself', () => {
	localStorage.setItem(NEW_TILL_ON_NEXT_LOAD_KEY, '1');
	expect(consumeNewTillOnNextLoad()).toBe(true);
	expect(localStorage.getItem(NEW_TILL_ON_NEXT_LOAD_KEY)).toBeNull();
	expect(consumeNewTillOnNextLoad()).toBe(false);
});

it('ignores any value but "1"', () => {
	localStorage.setItem(NEW_TILL_ON_NEXT_LOAD_KEY, 'true');
	expect(consumeNewTillOnNextLoad()).toBe(false);
	expect(localStorage.getItem(NEW_TILL_ON_NEXT_LOAD_KEY)).toBe('true');
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
		expect(consumeNewTillOnNextLoad()).toBe(false);
		Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: undefined });
		expect(consumeNewTillOnNextLoad()).toBe(false);
	} finally {
		if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
	}
});
