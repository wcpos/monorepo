import {
	beginCartAddTiming,
	cancelCartAddTiming,
	commitCartAddTiming,
	getCartAddTiming,
	subscribeCartAddTiming,
} from './cart-add-timing';

// A premature completion, stale/wrong cart match, or restarted timer would hide a slow add.
describe('cart add handler-to-commit timing', () => {
	const originalFlag = process.env.EXPO_PUBLIC_WCPOS_E2E;
	beforeEach(() => {
		process.env.EXPO_PUBLIC_WCPOS_E2E = '1';
		jest.spyOn(performance, 'now').mockReturnValue(100);
	});
	afterEach(() => {
		jest.restoreAllMocks();
		if (originalFlag === undefined) delete process.env.EXPO_PUBLIC_WCPOS_E2E;
		else process.env.EXPO_PUBLIC_WCPOS_E2E = originalFlag;
	});

	it('finishes only when the correct cart commits the expected product quantity', () => {
		const sequence = getCartAddTiming().sequence;
		beginCartAddTiming('order-1', 42, 2, 50);
		commitCartAddTiming('order-2', [{ product_id: 42, quantity: 3 }]);
		commitCartAddTiming('order-1', [{ product_id: 43, quantity: 3 }]);
		commitCartAddTiming('order-1', [{ product_id: 42, quantity: 2 }]);
		expect(getCartAddTiming().status).toBe('pending');
		commitCartAddTiming('order-1', [{ product_id: 42, quantity: 3 }]);
		expect(getCartAddTiming()).toMatchObject({
			sequence: sequence + 1,
			status: 'complete',
			quantity: 3,
			durationMs: 50,
		});
		jest.mocked(performance.now).mockReturnValue(900);
		commitCartAddTiming('order-1', [{ product_id: 42, quantity: 3 }]);
		expect(getCartAddTiming().durationMs).toBe(50);
	});

	it('includes a known delay instead of resetting the clock at commit', () => {
		beginCartAddTiming('slow-order', 42, 0, 100);
		jest.mocked(performance.now).mockReturnValue(1600);
		commitCartAddTiming('slow-order', [{ product_id: 42, quantity: 1 }]);
		expect(getCartAddTiming().durationMs).toBe(1500);
	});

	it('does not count a variation of the same product as the simple product', () => {
		beginCartAddTiming('variations', 42, 0, 100);
		commitCartAddTiming('variations', [{ product_id: 42, variation_id: 9, quantity: 1 }]);
		expect(getCartAddTiming().status).toBe('pending');
		commitCartAddTiming('variations', [{ product_id: 42, quantity: 1 }]);
		expect(getCartAddTiming().status).toBe('complete');
	});

	it('keeps overlapping adds invalid rather than publishing a deceptively fast sample', () => {
		const first = beginCartAddTiming('overlap', 42, 0, 100);
		beginCartAddTiming('overlap', 42, 0, 110);
		const third = beginCartAddTiming('overlap', 42, 0, 120);
		commitCartAddTiming('overlap', [{ product_id: 42, quantity: 1 }]);
		expect(getCartAddTiming().status).toBe('overlap');
		expect(getCartAddTiming().durationMs).toBeNull();
		cancelCartAddTiming(first);
		expect(getCartAddTiming().status).toBe('overlap');
		cancelCartAddTiming(third);
		expect(getCartAddTiming().status).toBe('idle');
	});

	it('does not let a failed older add cancel a newer sample', () => {
		const first = beginCartAddTiming('first', 42, 0, 100);
		cancelCartAddTiming(first);
		const second = beginCartAddTiming('second', 43, 0, 110);
		cancelCartAddTiming(first);
		expect(getCartAddTiming()).toMatchObject({
			sequence: second,
			status: 'pending',
			orderId: 'second',
		});
		cancelCartAddTiming(second);
		expect(getCartAddTiming().status).toBe('idle');
	});

	it('is inert outside explicitly instrumented runs', () => {
		delete process.env.EXPO_PUBLIC_WCPOS_E2E;
		const previous = getCartAddTiming();
		beginCartAddTiming('not-instrumented', 99, 0, 100);
		commitCartAddTiming('not-instrumented', [{ product_id: 99, quantity: 1 }]);
		expect(getCartAddTiming()).toBe(previous);
	});

	it('notifies subscribers about new samples and stops after unsubscribe', () => {
		const sequences: number[] = [];
		const unsubscribe = subscribeCartAddTiming(() => sequences.push(getCartAddTiming().sequence));
		const before = getCartAddTiming().sequence;
		beginCartAddTiming('subscriber', 1, 0, 100);
		expect(sequences).toEqual([before + 1]);
		unsubscribe();
		commitCartAddTiming('subscriber', [{ product_id: 1, quantity: 1 }]);
		expect(sequences).toEqual([before + 1]);
	});
});
