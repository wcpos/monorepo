import { NativeModules } from 'react-native';

import { reloadApp } from './reload-app';

jest.mock('react-native', () => ({
	NativeModules: { DevSettings: { reload: jest.fn() } },
	Platform: { OS: 'ios' },
}));

describe('reloadApp', () => {
	it('reports native reload as unavailable in production', () => {
		const originalDev = __DEV__;
		Object.defineProperty(globalThis, '__DEV__', { configurable: true, value: false });

		try {
			expect(reloadApp()).toBe(false);
			expect(NativeModules.DevSettings.reload).not.toHaveBeenCalled();
		} finally {
			Object.defineProperty(globalThis, '__DEV__', {
				configurable: true,
				value: originalDev,
			});
		}
	});
});
