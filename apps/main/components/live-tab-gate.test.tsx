import * as React from 'react';
import { Text } from 'react-native';

import { act, render } from '@testing-library/react-native';
import { BehaviorSubject } from 'rxjs';

import type { LiveTabState } from '@wcpos/database/live-tab/live-tab.web';

import { LiveTabGate } from './live-tab-gate.web';

const mockState = new BehaviorSubject<LiveTabState>({ kind: 'parked', reason: 'another-tab-live' });
const mockCreate = jest.fn(() => ({
	state$: mockState,
	getState: () => mockState.value,
	takeOver: jest.fn(),
	park: jest.fn(),
}));
jest.mock('@wcpos/database/live-tab/live-tab.web', () => ({
	createLiveTab: () => mockCreate(),
	holdLiveTab: jest.fn(),
}));
jest.mock('@wcpos/database/adapters/storage/index.web', () => ({
	terminateStorageWorker: jest.fn(),
	onStorageWorkerLost: jest.fn(),
}));
jest.mock('@wcpos/database/plugins/wrapped-error-handler-storage', () => ({
	degradedStorage$: new (jest.requireActual('rxjs').BehaviorSubject)([]),
}));
jest.mock('@wcpos/database/plugins/rx-database-registry', () => ({
	closeRegisteredDatabases: jest.fn(),
}));
jest.mock('@wcpos/core/contexts/app-state/use-hydration-suspense', () => ({
	finishPendingHydration: jest.fn(),
}));
jest.mock('@wcpos/core/utils/reload-app', () => ({ reloadApp: jest.fn() }));
jest.mock('../lib/create-app-engine', () => ({ disposeAppSyncEngine: jest.fn() }));
jest.mock('@wcpos/utils/logger', () => ({ log: { warn: jest.fn(), error: jest.fn() } }));
jest.mock('react-dom', () => ({ flushSync: (fn: () => void) => fn() }));
jest.mock('./parked-tab', () => ({ ParkedTab: () => null }));

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
