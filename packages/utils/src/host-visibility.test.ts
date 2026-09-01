import { hostIsVisible, onHostVisibilityChange, setHostVisible } from './host-visibility';

describe('host visibility', () => {
	it('defaults visible and notifies listeners only when the value changes', () => {
		const listener = jest.fn();
		const unsubscribe = onHostVisibilityChange(listener);

		expect(hostIsVisible()).toBe(true);
		setHostVisible(true);
		expect(listener).not.toHaveBeenCalled();

		setHostVisible(false);
		expect(hostIsVisible()).toBe(false);
		expect(listener).toHaveBeenCalledWith(false);

		setHostVisible(false);
		expect(listener).toHaveBeenCalledTimes(1);

		unsubscribe();
		setHostVisible(true);
		expect(listener).toHaveBeenCalledTimes(1);
	});
});
