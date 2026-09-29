import * as React from 'react';
import { Text } from 'react-native';

import { render } from '@testing-library/react-native';
import { renderToString } from 'react-dom/server';

import { createLiveTab } from '@wcpos/database/live-tab/live-tab.web';

import { LiveTabGate as ElectronGate } from './live-tab-gate.electron';
import { LiveTabGate } from './live-tab-gate.web';
const { LiveTabGate: NativeGate } =
	jest.requireActual<typeof import('./live-tab-gate')>('./live-tab-gate');

jest.mock('@wcpos/database/live-tab/live-tab.web', () => ({ createLiveTab: jest.fn() }));
jest.mock('@wcpos/database/adapters/storage/index.web', () => ({ onStorageWorkerLost: jest.fn() }));
jest.mock('@wcpos/database/plugins/rx-database-registry', () => ({}));
jest.mock('@wcpos/database/plugins/wrapped-error-handler-storage', () => ({}));
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
it('pre-renders web children with navigator undefined without creating a live tab', () => {
	const navigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
	Object.defineProperty(globalThis, 'navigator', { configurable: true, value: undefined });
	try {
		expect(renderToString(<LiveTabGate>SSR child</LiveTabGate>)).toContain('SSR child');
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
