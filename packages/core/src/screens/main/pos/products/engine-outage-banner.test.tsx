/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { EngineOutageBanner } from './engine-outage-banner';

const mockPush = jest.fn();
const mockUseEngineStatus = jest.fn();
let mockOnlineStatus = 'online-website-available';
let mockStorageDegraded = false;

jest.mock('expo-router', () => ({
	useRouter: () => ({ push: mockPush }),
}));

// @wcpos/components/text pulls @rn-primitives/slot (raw JSX in node_modules);
// render with react-native-web's Text instead.
jest.mock('@wcpos/components/text', () => {
	const { Text } = jest.requireActual('react-native');
	return { Text };
});

jest.mock('../../hooks/use-engine-monitor', () => ({
	useEngineStatus: () => mockUseEngineStatus(),
}));

jest.mock('../../hooks/use-storage-health', () => ({
	useStorageDegraded: () => mockStorageDegraded,
}));

jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: mockOnlineStatus }),
}));

jest.mock('../../../../contexts/translations', () => {
	const { createTestT } = jest.requireActual<typeof import('../../../../../jest/translate')>(
		'../../../../../jest/translate'
	);
	return { useT: () => createTestT() };
});

describe('EngineOutageBanner', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockOnlineStatus = 'online-website-available';
		mockStorageDegraded = false;
	});

	it('renders nothing while the engine is healthy', () => {
		mockUseEngineStatus.mockReturnValue({ connectivity: 'online', gatedBy: null });

		const { container } = render(<EngineOutageBanner />);

		expect(container.firstChild).toBeNull();
	});

	it('renders the outage message and status link while the engine is offline', () => {
		mockOnlineStatus = 'offline';
		mockUseEngineStatus.mockReturnValue({ connectivity: 'offline', gatedBy: 'offline' });

		render(<EngineOutageBanner />);

		expect(screen.getByTestId('engine-outage-banner').textContent).toContain(
			'Scanning unavailable — sync engine offline.'
		);
		fireEvent.click(screen.getByText('View status'));
		expect(mockPush).toHaveBeenCalledWith('/health/database');
	});

	it('refreshes immediately from live connectivity instead of a stale engine snapshot', () => {
		mockOnlineStatus = 'offline';
		mockUseEngineStatus.mockReturnValue({ connectivity: 'online', gatedBy: null });

		const { rerender } = render(<EngineOutageBanner />);

		expect(screen.getByTestId('engine-outage-banner')).toBeTruthy();

		mockOnlineStatus = 'online-website-available';
		mockUseEngineStatus.mockReturnValue({ connectivity: 'offline', gatedBy: 'offline' });
		rerender(<EngineOutageBanner />);

		expect(screen.queryByTestId('engine-outage-banner')).toBeNull();
	});

	it.each(['lifecycle', 'bootstrap-failed'])(
		'uses neutral copy while the online engine is gated by %s',
		(gatedBy) => {
			mockUseEngineStatus.mockReturnValue({ connectivity: 'online', gatedBy });

			render(<EngineOutageBanner />);

			expect(screen.getByTestId('engine-outage-banner').textContent).toContain(
				'Scanning unavailable — sync engine isn’t ready.'
			);
		}
	);

	// #163
	it('renders the storage outage message while the local database is degraded', () => {
		mockUseEngineStatus.mockReturnValue({ connectivity: 'online', gatedBy: null });
		mockStorageDegraded = true;

		render(<EngineOutageBanner />);

		expect(screen.queryByTestId('engine-outage-banner')).toBeNull();
		expect(screen.getByTestId('storage-outage-banner').textContent).toContain(
			'Local database unavailable'
		);
		fireEvent.click(screen.getByTestId('scan-outage-view-status'));
		expect(mockPush).toHaveBeenCalledWith('/health/database');
	});

	it('prefers the storage outage message over a concurrent engine outage', () => {
		mockOnlineStatus = 'offline';
		mockUseEngineStatus.mockReturnValue({ connectivity: 'offline', gatedBy: 'offline' });
		mockStorageDegraded = true;

		render(<EngineOutageBanner />);

		expect(screen.getByTestId('storage-outage-banner').textContent).toContain(
			'Local database unavailable'
		);
	});
});
