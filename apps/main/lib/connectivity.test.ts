import * as React from 'react';

import TestRenderer, { act } from 'react-test-renderer';

import { OnlineStatusContext, OnlineStatusProvider } from '@wcpos/hooks/use-online-status';

jest.mock('@react-native-community/netinfo', () => ({
	useNetInfoInstance: () => ({ netInfo: { isConnected: null, isInternetReachable: null } }),
}));

function loadConnectivity(): typeof import('./connectivity') {
	jest.resetModules();
	return jest.requireActual('./connectivity');
}

describe('app connectivity store', () => {
	it('defaults to offline until a connectivity signal is available', () => {
		const { getEngineConnectivity } = loadConnectivity();

		expect(getEngineConnectivity()).toBe('offline');
	});

	it('seeds offline when navigator reports offline at load', () => {
		const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
		Object.defineProperty(globalThis, 'navigator', {
			value: { onLine: false },
			configurable: true,
			writable: true,
		});
		try {
			const { getEngineConnectivity } = loadConnectivity();

			expect(getEngineConnectivity()).toBe('offline');
		} finally {
			if (original) {
				Object.defineProperty(globalThis, 'navigator', original);
			} else {
				delete (globalThis as { navigator?: unknown }).navigator;
			}
		}
	});

	it('keeps native connectivity offline until NetInfo resolves', () => {
		let status: string | undefined;
		act(() => {
			TestRenderer.create(
				React.createElement(
					OnlineStatusProvider,
					{ wpAPIURL: 'https://example.test' },
					React.createElement(OnlineStatusContext.Consumer, null, (value) => {
						status = value.status;
						return null;
					})
				)
			);
		});
		expect(status).toBe('offline');
	});

	it.each([
		['offline', 'offline'],
		['online-website-unavailable', 'degraded'],
		['online-website-available', 'online'],
	] as const)('maps %s to %s', (onlineStatus, engineConnectivity) => {
		const { getEngineConnectivity, setAppOnlineStatus } = loadConnectivity();

		setAppOnlineStatus(onlineStatus);

		expect(getEngineConnectivity()).toBe(engineConnectivity);
	});
});
