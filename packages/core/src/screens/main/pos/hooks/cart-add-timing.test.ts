import {
	beginCartAddTiming,
	cancelCartAddTiming,
	commitCartAddTiming,
	getCartAddTiming,
	markCartAddTiming,
	pendingCartAddSequence,
	subscribeCartAddTiming,
} from '../../../../../e2e/cart-add-timing';

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

	it('cannot be enabled in a normal build by a runtime global', () => {
		delete process.env.EXPO_PUBLIC_WCPOS_E2E;
		const runtime = globalThis as typeof globalThis & { __WCPOS_E2E_CART_TIMING__?: boolean };
		const original = runtime.__WCPOS_E2E_CART_TIMING__;
		try {
			runtime.__WCPOS_E2E_CART_TIMING__ = true;
			const previous = getCartAddTiming();
			beginCartAddTiming('production', 99, 0, 100);
			commitCartAddTiming('production', [{ product_id: 99, quantity: 1 }]);
			expect(getCartAddTiming()).toBe(previous);
		} finally {
			if (original === undefined) delete runtime.__WCPOS_E2E_CART_TIMING__;
			else runtime.__WCPOS_E2E_CART_TIMING__ = original;
		}
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

	describe('per-step marks', () => {
		const now = (ms: number) => jest.mocked(performance.now).mockReturnValue(ms);

		it('puts the marks of a pending add on the completed sample, rising in order', () => {
			const sequence = beginCartAddTiming('marks', 42, 0, 100);
			now(110.4);
			markCartAddTiming('queued', sequence);
			now(150);
			markCartAddTiming('birthRead', sequence);
			now(400.6);
			markCartAddTiming('hooks', sequence);
			now(900);
			markCartAddTiming('written', sequence);
			commitCartAddTiming('marks', [{ product_id: 42, quantity: 1 }]);
			const { marks } = getCartAddTiming();
			expect(marks).toEqual({ queued: 10, birthRead: 50, hooks: 301, written: 800 });
			expect(Object.keys(marks ?? {})).toEqual(['queued', 'birthRead', 'hooks', 'written']);
		});

		it('keeps the first value when a mark is recorded twice', () => {
			const sequence = beginCartAddTiming('first-wins', 42, 0, 100);
			now(120);
			markCartAddTiming('hooks', sequence);
			now(700);
			markCartAddTiming('hooks', sequence);
			commitCartAddTiming('first-wins', [{ product_id: 42, quantity: 1 }]);
			expect(getCartAddTiming().marks).toEqual({ hooks: 20 });
		});

		it('clears the previous add’s marks when a new add begins', () => {
			const previous = beginCartAddTiming('previous', 42, 0, 100);
			now(130);
			markCartAddTiming('queued', previous);
			markCartAddTiming('written', previous);
			commitCartAddTiming('previous', [{ product_id: 42, quantity: 1 }]);
			const next = beginCartAddTiming('next', 42, 0, 200);
			now(260);
			markCartAddTiming('hooks', next);
			commitCartAddTiming('next', [{ product_id: 42, quantity: 1 }]);
			expect(getCartAddTiming().marks).toEqual({ hooks: 60 });
		});

		// The next begin resets marks, so a stray mark is only visible as a clock read.
		it('does not record a mark while idle or overlapping', () => {
			const idle = beginCartAddTiming('idle-marks', 42, 0, 100);
			cancelCartAddTiming(idle);
			expect(getCartAddTiming().status).toBe('idle');
			jest.mocked(performance.now).mockClear();
			markCartAddTiming('queued', idle);
			expect(performance.now).not.toHaveBeenCalled();
			const first = beginCartAddTiming('overlap-marks', 42, 0, 100);
			const second = beginCartAddTiming('overlap-marks', 42, 0, 110);
			expect(getCartAddTiming().status).toBe('overlap');
			markCartAddTiming('birthRead', second);
			expect(performance.now).not.toHaveBeenCalled();
			cancelCartAddTiming(first);
			cancelCartAddTiming(second);
		});

		it('records a mark without notifying subscribers', () => {
			const sequence = beginCartAddTiming('quiet', 42, 0, 100);
			const listener = jest.fn();
			const unsubscribe = subscribeCartAddTiming(listener);
			markCartAddTiming('queued', sequence);
			markCartAddTiming('hooks', sequence);
			expect(listener).not.toHaveBeenCalled();
			unsubscribe();
			cancelCartAddTiming(sequence);
		});

		it('keeps sequence and status first and marks last in the serialised sample', () => {
			const sequence = beginCartAddTiming('serialised', 42, 0, 100);
			markCartAddTiming('queued', sequence);
			commitCartAddTiming('serialised', [{ product_id: 42, quantity: 1 }]);
			const sample = getCartAddTiming();
			expect(JSON.stringify(sample)).toMatch(/^\{"sequence":\d+,"status":"complete"/);
			expect(Object.keys(sample).pop()).toBe('marks');
		});

		it('records no mark outside explicitly instrumented runs', () => {
			const sequence = beginCartAddTiming('inert-marks', 42, 0, 100);
			delete process.env.EXPO_PUBLIC_WCPOS_E2E;
			now(500);
			markCartAddTiming('queued', sequence);
			process.env.EXPO_PUBLIC_WCPOS_E2E = '1';
			commitCartAddTiming('inert-marks', [{ product_id: 42, quantity: 1 }]);
			expect(getCartAddTiming().marks).toEqual({});
		});

		it('a mark that arrives after the commit is published into the completed sample', () => {
			const sequence = beginCartAddTiming('late-written', 42, 0, 100);
			now(150);
			commitCartAddTiming('late-written', [{ product_id: 42, quantity: 1 }]);
			const completed = getCartAddTiming();
			expect(completed).toMatchObject({ status: 'complete', durationMs: 50 });
			const listener = jest.fn();
			const unsubscribe = subscribeCartAddTiming(listener);
			now(251.4);
			markCartAddTiming('written', sequence);
			expect(getCartAddTiming()).toEqual({ ...completed, marks: { written: 151 } });
			expect(listener).toHaveBeenCalledTimes(1);
			unsubscribe();
		});

		it("a late mark from an older add never lands on a newer add's sample", () => {
			const s1 = beginCartAddTiming('older', 42, 0, 100);
			commitCartAddTiming('older', [{ product_id: 42, quantity: 1 }]);
			beginCartAddTiming('newer', 42, 0, 100);
			now(180);
			markCartAddTiming('written', s1);
			expect(getCartAddTiming().marks?.written).toBeUndefined();
			commitCartAddTiming('newer', [{ product_id: 42, quantity: 1 }]);
			expect(getCartAddTiming()).toMatchObject({ status: 'complete', marks: {} });
			expect(getCartAddTiming().marks?.written).toBeUndefined();
		});

		it('a mark without a sequence is ignored', () => {
			beginCartAddTiming('no-sequence', 42, 0, 100);
			markCartAddTiming('queued', undefined);
			commitCartAddTiming('no-sequence', [{ product_id: 42, quantity: 1 }]);
			expect(getCartAddTiming()).toMatchObject({ status: 'complete' });
			expect(getCartAddTiming().marks).toEqual({});
		});

		it('pendingCartAddSequence names only a pending add', () => {
			cancelCartAddTiming(getCartAddTiming().sequence);
			expect(pendingCartAddSequence()).toBeUndefined();
			const sequence = beginCartAddTiming('pending-sequence', 42, 0, 100);
			expect(pendingCartAddSequence()).toBe(sequence);
			delete process.env.EXPO_PUBLIC_WCPOS_E2E;
			expect(pendingCartAddSequence()).toBeUndefined();
			process.env.EXPO_PUBLIC_WCPOS_E2E = '1';
			commitCartAddTiming('pending-sequence', [{ product_id: 42, quantity: 1 }]);
			expect(pendingCartAddSequence()).toBeUndefined();
		});
	});
});
