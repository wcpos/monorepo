import * as React from 'react';
import { Text } from 'react-native';

import { act, render } from '@testing-library/react-native';
import { renderToString } from 'react-dom/server';
import { BehaviorSubject } from 'rxjs';

import { createLiveTab, type LiveTabState } from '@wcpos/database/live-tab/live-tab.web';

import { LiveTabGate as ElectronGate } from './live-tab-gate.electron';
import { LiveTabGate } from './live-tab-gate.web';
const { LiveTabGate: NativeGate } =
	jest.requireActual<typeof import('./live-tab-gate')>('./live-tab-gate');

jest.mock('react', () => ({
	...jest.requireActual('react'),
	useSyncExternalStore: jest.fn(jest.requireActual('react').useSyncExternalStore),
}));
jest.mock('@wcpos/database/live-tab/live-tab.web', () => ({ createLiveTab: jest.fn() }));
jest.mock('@wcpos/database/adapters/storage/index.web', () => ({ onStorageWorkerLost: jest.fn() }));
jest.mock('@wcpos/database/plugins/rx-database-registry', () => ({}));
jest.mock('@wcpos/database/plugins/wrapped-error-handler-storage', () => ({
	degradedStorage$: new (jest.requireActual('rxjs').BehaviorSubject)([]),
}));
jest.mock('@wcpos/core/contexts/app-state/use-hydration-suspense', () => ({}));
jest.mock('@wcpos/core/utils/reload-app', () => ({}));
jest.mock('../lib/create-app-engine', () => ({}));
jest.mock('./parked-tab', () => ({ ParkedTab: () => null }));
jest.mock('@wcpos/utils/logger', () => ({ log: { warn: jest.fn() } }));

it.each([NativeGate, ElectronGate])(
	'renders non-web children immediately without accessing navigator.locks',
	async (Gate) => {
		const navigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
		Object.defineProperty(globalThis, 'navigator', {
			configurable: true,
			get() {
				throw new Error('native must not access navigator');
			},
		});
		try {
			const view = await render(
				<Gate>
					<Text testID="native-child">Native</Text>
				</Gate>
			);
			expect(view.getByTestId('native-child')).toBeTruthy();
		} finally {
			if (navigator) Object.defineProperty(globalThis, 'navigator', navigator);
			else Reflect.deleteProperty(globalThis, 'navigator');
		}
	}
);
it('server snapshot is acquiring without navigator and does not create a live tab', () => {
	const navigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
	Object.defineProperty(globalThis, 'navigator', { configurable: true, value: undefined });
	try {
		expect(renderToString(<LiveTabGate>SSR child</LiveTabGate>)).toBe('');
		expect(createLiveTab).not.toHaveBeenCalled();
	} finally {
		if (navigator) Object.defineProperty(globalThis, 'navigator', navigator);
		else Reflect.deleteProperty(globalThis, 'navigator');
	}
});
it('does not acquire a Web Lock during render', () => {
	const navigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
	Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: {} } });
	try {
		expect(renderToString(<LiveTabGate>child</LiveTabGate>)).not.toContain('child');
		expect(createLiveTab).not.toHaveBeenCalled();
	} finally {
		if (navigator) Object.defineProperty(globalThis, 'navigator', navigator);
		else Reflect.deleteProperty(globalThis, 'navigator');
	}
});

// The React Native Jest preset cannot use jsdom (it redefines window). Inspect
// the actual third useSyncExternalStore argument used by SSR AND hydration.
it('keeps the hydration snapshot acquiring and lets the effect resolve ownership', async () => {
	const state = new BehaviorSubject<LiveTabState>({ kind: 'acquiring' });
	jest.mocked(createLiveTab).mockReturnValue({
		state$: state.asObservable(),
		getState: () => state.value,
		takeOver: jest.fn(),
		park: jest.fn(),
		dispose: jest.fn(),
	});
	const react = jest.requireActual<typeof React>('react');
	const useStore = react.useSyncExternalStore;
	const snapshots: unknown[] = [];
	const spy = jest
		.mocked(React.useSyncExternalStore)
		.mockImplementation((subscribe, getSnapshot, getServerSnapshot) => {
			snapshots.push(getServerSnapshot!());
			return useStore(subscribe, getSnapshot, getServerSnapshot);
		});
	const navigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
	try {
		Object.defineProperty(globalThis, 'navigator', { configurable: true, value: undefined });
		expect(renderToString(<LiveTabGate>SSR child</LiveTabGate>)).toBe('');
		Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: {} } });
		const view = await render(
			<LiveTabGate>
				<Text testID="web-child">App</Text>
			</LiveTabGate>
		);
		expect(view.queryByTestId('web-child')).toBeNull();
		expect(createLiveTab).toHaveBeenCalledTimes(1);
		await act(async () => state.next({ kind: 'live' }));
		expect(view.getByTestId('web-child')).toBeTruthy();
		// Even once live, hydration must reproduce the server's acquiring value.
		expect(snapshots.length).toBeGreaterThanOrEqual(3);
		for (const snapshot of snapshots) expect(snapshot).toEqual({ kind: 'acquiring' });
	} finally {
		spy.mockImplementation(useStore);
		if (navigator) Object.defineProperty(globalThis, 'navigator', navigator);
		else Reflect.deleteProperty(globalThis, 'navigator');
	}
});
