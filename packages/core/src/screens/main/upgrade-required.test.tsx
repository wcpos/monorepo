/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { UpgradeRequired } from './upgrade-required';

jest.mock('@wcpos/components/button', () => {
	const { Pressable, Text } = jest.requireActual('react-native');
	return { Button: Pressable, ButtonText: Text };
});
// The docs link's system-browser hand-off (expo-linking) is outside this test; the gate has no docs.
jest.mock('@wcpos/components/docs-link', () => ({ DocsLink: () => null }));
// SVG runtimes (the mark and the glyph) are outside this composition test.
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/logo', () => ({ Logo: () => null }));
jest.mock('../../contexts/app-state', () => ({ useAppState: () => ({ logout: jest.fn() }) }));
jest.mock('../../contexts/translations', () => {
	const { createTestT } =
		jest.requireActual<typeof import('../../../jest/translate')>('../../../jest/translate');
	return { useT: () => createTestT() };
});

describe('UpgradeRequired', () => {
	it('is the gate screen naming the plugin, with logout as its only action', () => {
		render(<UpgradeRequired />);

		expect(screen.getByTestId('upgrade-required-screen')).toBeTruthy();
		expect(screen.getByTestId('upgrade-required-screen-title').textContent).toBe(
			'Update the WCPOS plugin on your WordPress site.'
		);
		expect(screen.getByTestId('upgrade-required-logout')).toBeTruthy();
		expect(screen.queryByTestId('upgrade-required-screen-primary')).toBeNull();
	});
});
