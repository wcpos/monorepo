/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { EngineOutageBanner } from './engine-outage-banner';

const mockPush = jest.fn();
const mockUseEngineStatus = jest.fn();

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

jest.mock('../../../../contexts/translations', () => ({
	useT: () => (_key: string, options?: { defaultValue?: string }) => options?.defaultValue,
}));

describe('EngineOutageBanner', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('renders nothing while the engine is healthy', () => {
		mockUseEngineStatus.mockReturnValue({ connectivity: 'online', gatedBy: null });

		const { container } = render(<EngineOutageBanner />);

		expect(container.firstChild).toBeNull();
	});

	it('renders the outage message and status link while the engine is offline', () => {
		mockUseEngineStatus.mockReturnValue({ connectivity: 'offline', gatedBy: 'offline' });

		render(<EngineOutageBanner />);

		expect(screen.getByTestId('engine-outage-banner').textContent).toContain(
			'Scanning unavailable — sync engine offline.'
		);
		fireEvent.click(screen.getByText('View status'));
		expect(mockPush).toHaveBeenCalledWith('/health/database');
	});
});
