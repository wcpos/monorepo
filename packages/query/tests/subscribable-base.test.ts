import { SubscribableBase } from '../src/subscribable-base';
import { Subject, Subscription } from 'rxjs';

describe('SubscribableBase', () => {
	let instance: SubscribableBase;

	beforeEach(() => {
		instance = new SubscribableBase();
	});

	afterEach(async () => {
		if (!instance.isCanceled) {
			await instance.cancel();
		}
	});

	it('should start in non-canceled state', () => {
		expect(instance.isCanceled).toBe(false);
		expect(instance.isAborted).toBe(false);
	});

	describe('addSub', () => {
		it('should add a subscription', () => {
			const subject = new Subject<void>();
			const sub = subject.subscribe();
			instance.addSub('test', sub);
			expect(instance.subs['test']).toBe(sub);
		});

		it('should unsubscribe previous subscription when adding same key', () => {
			const sub1 = new Subscription();
			const sub2 = new Subscription();
			const spy = jest.spyOn(sub1, 'unsubscribe');

			instance.addSub('key', sub1);
			instance.addSub('key', sub2);

			expect(spy).toHaveBeenCalled();
			expect(instance.subs['key']).toBe(sub2);
		});
	});

	describe('cancelSub', () => {
		it('should cancel a specific subscription', () => {
			const sub = new Subscription();
			const spy = jest.spyOn(sub, 'unsubscribe');

			instance.addSub('key', sub);
			instance.cancelSub('key');

			expect(spy).toHaveBeenCalled();
			expect(instance.subs['key']).toBeUndefined();
		});

		it('should do nothing for non-existent key', () => {
			expect(() => instance.cancelSub('nonexistent')).not.toThrow();
		});
	});

	describe('signal', () => {
		it('should return an AbortSignal', () => {
			expect(instance.signal).toBeInstanceOf(AbortSignal);
			expect(instance.signal.aborted).toBe(false);
		});
	});

	describe('cancel', () => {
		it('should mark as canceled', async () => {
			await instance.cancel();
			expect(instance.isCanceled).toBe(true);
			expect(instance.isAborted).toBe(true);
		});

		it('should unsubscribe all subscriptions', async () => {
			const sub = new Subscription();
			const spy = jest.spyOn(sub, 'unsubscribe');
			instance.addSub('test', sub);

			await instance.cancel();
			expect(spy).toHaveBeenCalled();
		});

		it('should abort the signal', async () => {
			await instance.cancel();
			expect(instance.signal.aborted).toBe(true);
		});

		it('should emit cancel$', (done) => {
			instance.cancel$.subscribe({
				next: () => done(),
			});
			instance.cancel();
		});

		it('should be idempotent', async () => {
			await instance.cancel();
			await instance.cancel(); // should not throw
			expect(instance.isCanceled).toBe(true);
		});
	});
});
