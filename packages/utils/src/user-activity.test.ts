import { lastUserActivityMs, markUserActivity, onUserActivity } from './user-activity';

describe('user activity', () => {
	it('starts at zero and records explicit or current timestamps', () => {
		expect(lastUserActivityMs()).toBe(0);

		markUserActivity(1234);
		expect(lastUserActivityMs()).toBe(1234);

		const now = jest.spyOn(Date, 'now').mockReturnValue(5678);
		markUserActivity();
		expect(lastUserActivityMs()).toBe(5678);
		now.mockRestore();
	});

	it('notifies listeners until they unsubscribe', () => {
		const listener = jest.fn();
		const unsubscribe = onUserActivity(listener);

		markUserActivity(6_000);
		expect(listener).toHaveBeenCalledTimes(1);

		unsubscribe();
		markUserActivity(7_000);
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it('updates the timestamp and continues notifying after a listener throws', () => {
		const throwingUnsubscribe = onUserActivity(() => {
			throw new Error('listener failed');
		});
		const listener = jest.fn();
		const listenerUnsubscribe = onUserActivity(listener);

		expect(() => markUserActivity(8_000)).not.toThrow();
		expect(lastUserActivityMs()).toBe(8_000);
		expect(listener).toHaveBeenCalledTimes(1);

		throwingUnsubscribe();
		listenerUnsubscribe();
	});
});
