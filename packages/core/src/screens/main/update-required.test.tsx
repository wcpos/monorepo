/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { UpdateRequired } from './update-required';

let mockPlatform: 'web' | 'electron' | 'native' = 'web';

jest.mock('@wcpos/utils/platform', () => ({
	Platform: {
		get isWeb() {
			return mockPlatform === 'web';
		},
		get isElectron() {
			return mockPlatform === 'electron';
		},
		get isNative() {
			return mockPlatform === 'native';
		},
	},
}));
jest.mock('@wcpos/components/button', () => {
	const { Pressable, Text } = jest.requireActual('react-native');
	return { Button: Pressable, ButtonText: Text };
});
jest.mock('@wcpos/components/docs-link', () => {
	const { Text } = jest.requireActual('react-native');
	return {
		DocsLink: ({ testID, children }: { testID?: string; children: string }) => (
			<Text testID={testID}>{children}</Text>
		),
	};
});
// SVG runtimes (the mark and the glyph) are outside this composition test.
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/logo', () => ({ Logo: () => null }));
jest.mock('../../contexts/app-state', () => ({ useAppState: () => ({ logout: jest.fn() }) }));
jest.mock('../../contexts/translations', () => {
	const { createTestT } =
		jest.requireActual<typeof import('../../../jest/translate')>('../../../jest/translate');
	return { useT: () => createTestT() };
});

describe('UpdateRequired', () => {
	beforeEach(() => {
		mockPlatform = 'web';
	});

	it('is the gate screen, with the SYNC341 docs link and logout on every platform', () => {
		render(<UpdateRequired />);

		expect(screen.getByTestId('update-required-screen')).toBeTruthy();
		expect(screen.getByTestId('update-required-docs-link-SYNC341')).toBeTruthy();
		expect(screen.getByTestId('update-required-logout')).toBeTruthy();
	});

	it('offers reload on the web build', () => {
		render(<UpdateRequired />);

		expect(screen.getByTestId('update-required-reload')).toBeTruthy();
	});

	it.each(['electron', 'native'] as const)('does not offer reload on %s', (platform) => {
		mockPlatform = platform;
		render(<UpdateRequired />);

		expect(screen.queryByTestId('update-required-reload')).toBeNull();
		expect(screen.getByTestId('update-required-logout')).toBeTruthy();
	});
});
