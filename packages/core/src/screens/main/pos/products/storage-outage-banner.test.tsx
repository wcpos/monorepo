/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { StorageOutageBanner } from './storage-outage-banner';

const mockPush = jest.fn();
const mockReloadApp = jest.fn();
let mockStorageDegraded = false;

jest.mock('../../../../utils/reload-app', () => ({
	reloadApp: () => mockReloadApp(),
}));

jest.mock('expo-router', () => ({
	useRouter: () => ({ push: mockPush }),
}));

// @wcpos/components/text pulls @rn-primitives/slot (raw JSX in node_modules);
// render with react-native-web's Text instead.
jest.mock('@wcpos/components/text', () => {
	const { Text } = jest.requireActual('react-native');
	return { Text };
});

jest.mock('../../hooks/use-storage-health', () => ({
	useStorageDegraded: () => mockStorageDegraded,
}));

jest.mock('../../../../contexts/translations', () => {
	const { createTestT } = jest.requireActual<typeof import('../../../../../jest/translate')>(
		'../../../../../jest/translate'
	);
	return { useT: () => createTestT() };
});

describe('StorageOutageBanner', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockStorageDegraded = false;
	});

	it('renders nothing while storage is healthy', () => {
		const { container } = render(<StorageOutageBanner />);

		expect(container.firstChild).toBeNull();
	});

	// #163
	it('renders the storage outage message and status link while the local database is degraded', () => {
		mockStorageDegraded = true;

		render(<StorageOutageBanner />);

		expect(screen.getByTestId('storage-outage-banner').textContent).toContain(
			'Local database unavailable'
		);
		fireEvent.click(screen.getByTestId('scan-outage-view-status'));
		expect(mockPush).toHaveBeenCalledWith('/health/database');
	});

	// #163 ruling R5: reload is the real recovery for a dead worker, so the banner
	// carries the action rather than only describing it.
	it('offers a reload call-to-action while the local database is degraded', () => {
		mockStorageDegraded = true;

		render(<StorageOutageBanner />);

		expect(screen.getByTestId('storage-outage-banner').textContent).toContain('are blocked');
		fireEvent.click(screen.getByTestId('storage-outage-reload'));
		expect(mockReloadApp).toHaveBeenCalledTimes(1);
	});
});
