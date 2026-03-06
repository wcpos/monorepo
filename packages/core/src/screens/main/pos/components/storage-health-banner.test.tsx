/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { StorageHealthBanner } from './storage-health-banner';

const mockUseStorageHealth = jest.fn();

jest.mock('../../contexts/storage-health/provider', () => ({
	useStorageHealth: () => mockUseStorageHealth(),
}));

jest.mock(
	'@wcpos/components/hstack',
	() => ({
		HStack: ({ children, testID, ...props }: any) =>
			React.createElement('div', { ...props, 'data-testid': testID }, children),
	}),
	{ virtual: true }
);

jest.mock(
	'@wcpos/components/text',
	() => ({
		Text: ({ children, ...props }: any) => React.createElement('span', props, children),
	}),
	{ virtual: true }
);

jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => {
		switch (key) {
			case 'common.pos_storage_connection_lost':
				return 'POS storage connection was lost.';
			case 'common.stop_using_this_register_until_reloaded':
				return 'Stop using this register until it is reloaded and sync is checked.';
			default:
				return key;
		}
	},
}));

describe('StorageHealthBanner', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('shows a blocking warning when storage health is degraded', () => {
		mockUseStorageHealth.mockReturnValue({ status: 'degraded', isDegraded: true });

		render(React.createElement(StorageHealthBanner));

		expect(screen.getByText(/POS storage connection was lost/i)).toBeTruthy();
		expect(screen.getByText(/Stop using this register until it is reloaded/i)).toBeTruthy();
	});

	it('renders nothing when storage health is healthy', () => {
		mockUseStorageHealth.mockReturnValue({ status: 'healthy', isDegraded: false });

		const { queryByTestId } = render(React.createElement(StorageHealthBanner));

		expect(queryByTestId('storage-health-banner')).toBeNull();
	});
});
