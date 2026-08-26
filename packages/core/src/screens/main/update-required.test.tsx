/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { UpdateRequired } from './update-required';

let mockIsWeb = true;

jest.mock('@wcpos/utils/platform', () => ({
	Platform: {
		get isWeb() {
			return mockIsWeb;
		},
	},
}));
jest.mock('@wcpos/components/button', () => {
	const { Pressable, Text } = jest.requireActual('react-native');
	return { Button: Pressable, ButtonText: Text };
});
jest.mock('@wcpos/components/docs-link', () => {
	const { Text } = jest.requireActual('react-native');
	return { DocsLink: Text };
});
jest.mock('@wcpos/components/hstack', () => {
	const { View } = jest.requireActual('react-native');
	return { HStack: View };
});
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/text', () => {
	const { Text } = jest.requireActual('react-native');
	return { Text };
});
jest.mock('@wcpos/components/vstack', () => {
	const { View } = jest.requireActual('react-native');
	return { VStack: View };
});
jest.mock('../../contexts/app-state', () => ({ useAppState: () => ({ logout: jest.fn() }) }));
jest.mock('../../contexts/translations', () => {
	const { createTestT } =
		jest.requireActual<typeof import('../../../jest/translate')>('../../../jest/translate');
	return { useT: () => createTestT() };
});

describe('UpdateRequired', () => {
	beforeEach(() => {
		mockIsWeb = true;
	});

	it('offers reload on the web build', () => {
		render(<UpdateRequired />);

		expect(screen.getByTestId('update-required-reload')).toBeTruthy();
	});

	it('does not offer reload in the Electron renderer', () => {
		mockIsWeb = false;
		render(<UpdateRequired />);

		expect(screen.queryByTestId('update-required-reload')).toBeNull();
	});
});
