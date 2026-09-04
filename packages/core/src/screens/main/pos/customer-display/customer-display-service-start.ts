let version = 0;
const listeners = new Set<() => void>();

export const getCustomerDisplayServiceStartVersion = () => version;
export const notifyCustomerDisplayServiceStart = () => {
	version += 1;
	listeners.forEach((listener) => listener());
};
export const subscribeCustomerDisplayServiceStart = (listener: () => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};
