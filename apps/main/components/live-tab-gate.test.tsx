import * as React from 'react';
import { Text } from 'react-native';

import { act, render } from '@testing-library/react-native';
import { BehaviorSubject } from 'rxjs';

import type { LiveTabState } from '@wcpos/database/live-tab/live-tab.web';
import {
	closeRegisteredDatabases,
	getRegisteredDatabaseNames,
} from '@wcpos/database/plugins/rx-database-registry';
import { markStorageTerminallyFailed } from '@wcpos/database/plugins/wrapped-error-handler-storage';
import { terminateStorageWorker } from '@wcpos/database/adapters/storage/index.web';
import { reloadApp } from '@wcpos/core/utils/reload-app';
import { createLiveTab } from '@wcpos/database/live-tab/live-tab.web';

import { LiveTabGate } from './live-tab-gate.web';

const mockFinishPendingHydration = jest.fn();
const mockState = new BehaviorSubject<LiveTabState>({ kind: 'parked', reason: 'another-tab-live' });
const mockCreate = jest.fn((_deps: Parameters<typeof createLiveTab>[0]) => ({
	state$: mockState,
	getState: () => mockState.value,
	takeOver: jest.fn(),
	park: jest.fn(),
}));
jest.mock('@wcpos/database/live-tab/live-tab.web', () => ({
	HANDOVER_TEARDOWN_DEADLINE_MS: 10_000,
	createLiveTab: (deps: Parameters<typeof createLiveTab>[0]) => mockCreate(deps),
	holdLiveTab: jest.fn(),
}));
jest.mock('@wcpos/database/adapters/storage/index.web', () => ({
	terminateStorageWorker: jest.fn(),
	onStorageWorkerLost: jest.fn(),
}));
jest.mock('@wcpos/database/plugins/wrapped-error-handler-storage', () => ({
	markStorageTerminallyFailed: jest.fn(),
	degradedStorage$: new (jest.requireActual('rxjs').BehaviorSubject)([]),
}));
jest.mock('@wcpos/database/plugins/rx-database-registry', () => ({
	closeRegisteredDatabases: jest.fn(),
	getRegisteredDatabaseNames: jest.fn(() => ['user', 'store']),
}));
jest.mock('@wcpos/core/contexts/app-state/use-hydration-suspense', () => ({
	finishPendingHydration: () => mockFinishPendingHydration(),
}));
jest.mock('@wcpos/core/utils/reload-app', () => ({ reloadApp: jest.fn() }));
jest.mock('../lib/create-app-engine', () => ({ disposeAppSyncEngine: jest.fn() }));
jest.mock('@wcpos/utils/logger', () => ({ log: { warn: jest.fn(), error: jest.fn() } }));
jest.mock('react-dom', () => ({ flushSync: (fn: () => void) => fn() }));
jest.mock('./parked-tab', () => ({ ParkedTab: () => null }));

beforeAll(() =>
	Object.defineProperty(globalThis.navigator, 'locks', { configurable: true, value: {} })
);

it('does not render children while parked; renders while live; creates the page singleton once', async () => {
	const view = await render(
		<LiveTabGate>
			<Text testID="child">App</Text>
		</LiveTabGate>
	);
	expect(view.queryByTestId('child')).toBeNull();
	await act(async () => mockState.next({ kind: 'live' }));
	expect(view.getByTestId('child')).toBeTruthy();
	await view.rerender(
		<LiveTabGate>
			<Text testID="child">Again</Text>
		</LiveTabGate>
	);
	expect(mockCreate).toHaveBeenCalledTimes(1);
	await act(async () => mockState.next({ kind: 'parked', reason: 'worker-lost' }));
	expect(view.queryByTestId('child')).toBeNull();
});

it('terminally fails each registered database at the teardown deadline, then terminates before unlocking', async () => {
	jest.useFakeTimers();
	const events: string[] = [];
	mockFinishPendingHydration.mockReturnValue(new Promise(() => {}));
	let finishClose!: () => void;
	jest.mocked(closeRegisteredDatabases).mockImplementation(
		() =>
			new Promise<void>((resolve) => {
				finishClose = resolve;
			})
	);
	jest.mocked(markStorageTerminallyFailed).mockImplementation((name) => {
		events.push(name);
		if (name === 'store') finishClose();
		return true;
	});
	jest.mocked(terminateStorageWorker).mockImplementation(() => {
		events.push('terminate');
	});
	try {
		const channel = {
			onmessage: null as ((event: MessageEvent<unknown>) => void) | null,
			postMessage: jest.fn(),
			close: jest.fn(),
		};
		const protocol = jest
			.requireActual<typeof import('@wcpos/database/live-tab/live-tab.web')>(
				'@wcpos/database/live-tab/live-tab.web'
			)
			.createLiveTab({
				...mockCreate.mock.calls[0][0],
				locks: {
					request: async (_name, _options, callback) => {
						await callback({ name: 'wcpos-live-tab', mode: 'exclusive' });
						events.push('unlock');
					},
				},
				channel: () => channel,
			});
		channel.onmessage!({
			data: { type: 'takeover-request', requestId: 'requester' },
		} as MessageEvent);
		await jest.advanceTimersByTimeAsync(9999);
		expect(events).toEqual([]);
		await jest.advanceTimersByTimeAsync(1);
		expect(channel.postMessage).toHaveBeenCalledWith({
			type: 'takeover-released',
			requestId: 'requester',
		});
		protocol.dispose();
		expect(getRegisteredDatabaseNames).toHaveBeenCalled();
		expect(markStorageTerminallyFailed).toHaveBeenCalledWith('user', 'live-tab handover');
		expect(markStorageTerminallyFailed).toHaveBeenCalledWith('store', 'live-tab handover');
		expect(events).toEqual(['user', 'store', 'terminate', 'unlock']);
		const view = await render(
			<LiveTabGate>
				<Text testID="retired-child">App</Text>
			</LiveTabGate>
		);
		await act(async () => mockState.next({ kind: 'live' }));
		expect(reloadApp).toHaveBeenCalledTimes(1);
		expect(view.queryByTestId('retired-child')).toBeNull();
	} finally {
		jest.useRealTimers();
	}
});
