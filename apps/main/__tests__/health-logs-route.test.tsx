import type * as React from 'react';

const mockMarkAsRead = jest.fn();
const mockLoad = jest.fn<Promise<{ LogsScreen: () => null }>, []>();

jest.mock('expo-router', () => {
	const React = require('react') as typeof import('react');
	return {
		useFocusEffect: (callback: () => void) => React.useEffect(() => callback(), [callback]),
	};
});
jest.mock('../components/unread-logs', () => ({
	useMarkLogsAsRead: () => mockMarkAsRead,
}));
jest.mock('@wcpos/core/screens/main/rest/lazy', () => ({ loadRest: () => mockLoad() }), {
	virtual: true,
});

beforeEach(() => {
	mockMarkAsRead.mockClear();
	mockLoad.mockReset();
});

it('does not mark logs read while the screen is suspended', async () => {
	mockLoad.mockImplementation(() => new Promise(() => undefined));
	await jest.isolateModulesAsync(async () => {
		const React = require('react') as typeof import('react');
		const { act, create } = require('react-test-renderer') as typeof import('react-test-renderer');
		const { default: HealthLogsRoute } =
			require('../app/(app)/(drawer)/health/logs') as typeof import('../app/(app)/(drawer)/health/logs');

		let renderer!: ReturnType<typeof create>;
		await act(async () => {
			renderer = create(React.createElement(HealthLogsRoute));
		});
		expect(mockMarkAsRead).not.toHaveBeenCalled();
		act(() => renderer.unmount());
	});
});

it('marks logs read once the screen resolves', async () => {
	mockLoad.mockResolvedValue({ LogsScreen: () => null });
	await jest.isolateModulesAsync(async () => {
		const React = require('react') as typeof import('react');
		const { act, create } = require('react-test-renderer') as typeof import('react-test-renderer');
		const { default: HealthLogsRoute } =
			require('../app/(app)/(drawer)/health/logs') as typeof import('../app/(app)/(drawer)/health/logs');

		let renderer!: ReturnType<typeof create>;
		await act(async () => {
			renderer = create(React.createElement(HealthLogsRoute));
		});
		expect(mockMarkAsRead).toHaveBeenCalledTimes(1);
		act(() => renderer.unmount());
	});
});
