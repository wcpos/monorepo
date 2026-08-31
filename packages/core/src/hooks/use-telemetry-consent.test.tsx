/**
 * @jest-environment jsdom
 */
import { renderHook, waitFor } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { useTelemetryConsent as useElectronTelemetryConsent } from './use-telemetry-consent.electron';
import { useTelemetryConsent as useWebTelemetryConsent } from './use-telemetry-consent';

const mockSetTelemetryConsent = jest.fn();
const mockSend = jest.fn();
let mockStore:
	| {
			tracking_consent: 'allowed';
			tracking_consent$: BehaviorSubject<'allowed'>;
	  }
	| undefined;

jest.mock('@wcpos/core/contexts/app-state', () => ({
	useAppState: () => ({ store: mockStore }),
}));

jest.mock('@wcpos/utils/logger/sentry-sink', () => ({
	setTelemetryConsent: (consent: unknown) => mockSetTelemetryConsent(consent),
}));

describe('useTelemetryConsent', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockStore = {
			tracking_consent: 'allowed',
			tracking_consent$: new BehaviorSubject<'allowed'>('allowed'),
		};
		Object.defineProperty(window, 'ipcRenderer', {
			configurable: true,
			value: { send: mockSend },
		});
	});

	it('has no opinion before the store has ever loaded (boot)', async () => {
		mockStore = undefined;
		renderHook(() => useElectronTelemetryConsent());
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(mockSetTelemetryConsent).not.toHaveBeenCalled();
		expect(mockSend).not.toHaveBeenCalled();
	});

	it('resets the web sink when the store becomes unavailable', async () => {
		const { rerender } = renderHook(() => useWebTelemetryConsent());
		await waitFor(() => expect(mockSetTelemetryConsent).toHaveBeenLastCalledWith('allowed'));

		mockStore = undefined;
		rerender();

		await waitFor(() => expect(mockSetTelemetryConsent).toHaveBeenLastCalledWith('undecided'));
	});

	it('resets both Electron telemetry processes when the store becomes unavailable', async () => {
		const { rerender } = renderHook(() => useElectronTelemetryConsent());
		await waitFor(() => expect(mockSend).toHaveBeenLastCalledWith('telemetry-consent', 'allowed'));

		mockStore = undefined;
		rerender();

		await waitFor(() => {
			expect(mockSetTelemetryConsent).toHaveBeenLastCalledWith('undecided');
			expect(mockSend).toHaveBeenLastCalledWith('telemetry-consent', 'undecided');
		});
	});
});
