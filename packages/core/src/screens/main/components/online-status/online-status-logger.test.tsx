/** @jest-environment jsdom */
jest.mock('@wcpos/utils/logger', () => {
	const actual = jest.requireActual<typeof import('@wcpos/utils/logger')>('@wcpos/utils/logger');
	const logger = {
		error: jest.fn(),
		success: jest.fn(),
	};

	return {
		...actual,
		getLogger: jest.fn(() => logger),
		__logger: logger,
	};
});

/* eslint-disable import/first -- logger mock must precede component module initialization */
import * as React from 'react';

import { act, render } from '@testing-library/react';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';

import { OnlineStatusLogger } from './online-status-logger';
/* eslint-enable import/first */

jest.mock('@wcpos/hooks/use-online-status', () => ({ useOnlineStatus: jest.fn() }));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

const mockUseOnlineStatus = jest.mocked(useOnlineStatus);
const { __logger: logger } = jest.requireMock('@wcpos/utils/logger') as {
	__logger: { error: jest.Mock; success: jest.Mock };
};

describe('OnlineStatusLogger', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.clearAllMocks();
		mockUseOnlineStatus.mockReturnValue({ status: 'online-website-unavailable' });
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it('does not log on initial mount', () => {
		render(<OnlineStatusLogger />);

		expect(logger.error).not.toHaveBeenCalled();
		expect(logger.success).not.toHaveBeenCalled();
	});

	it('logs once when the device stays offline through the settle window', () => {
		const { rerender } = render(<OnlineStatusLogger />);
		mockUseOnlineStatus.mockReturnValue({ status: 'offline' });

		rerender(<OnlineStatusLogger />);
		act(() => jest.advanceTimersByTime(5_000));

		expect(logger.error).toHaveBeenCalledTimes(1);
		expect(logger.error).toHaveBeenCalledWith('Device went offline', {
			code: 'SYNC999',
			context: { type: 'connectivity.device-offline' },
			showToast: true,
			toast: { title: 'common.device_went_offline' },
		});
	});

	it('logs once when the connection is restored', () => {
		const { rerender } = render(<OnlineStatusLogger />);
		mockUseOnlineStatus.mockReturnValue({ status: 'online-website-available' });

		rerender(<OnlineStatusLogger />);
		act(() => jest.advanceTimersByTime(5_000));

		expect(logger.success).toHaveBeenCalledTimes(1);
		expect(logger.success).toHaveBeenCalledWith('Connection restored', {
			context: { type: 'connectivity.restored' },
			showToast: true,
			toast: { title: 'common.connection_restored' },
		});
	});

	it('does not log again when the status is unchanged', () => {
		const { rerender } = render(<OnlineStatusLogger />);
		mockUseOnlineStatus.mockReturnValue({ status: 'offline' });
		rerender(<OnlineStatusLogger />);

		rerender(<OnlineStatusLogger />);
		act(() => jest.advanceTimersByTime(5_000));

		expect(logger.error).toHaveBeenCalledTimes(1);
		expect(logger.success).not.toHaveBeenCalled();
	});

	it('does not log an offline-to-online flap within the settle window', () => {
		mockUseOnlineStatus.mockReturnValue({ status: 'online-website-available' });
		const { rerender } = render(<OnlineStatusLogger />);

		mockUseOnlineStatus.mockReturnValue({ status: 'offline' });
		rerender(<OnlineStatusLogger />);
		act(() => jest.advanceTimersByTime(4_999));
		mockUseOnlineStatus.mockReturnValue({ status: 'online-website-available' });
		rerender(<OnlineStatusLogger />);
		act(() => jest.advanceTimersByTime(5_000));

		expect(logger.error).not.toHaveBeenCalled();
		expect(logger.success).not.toHaveBeenCalled();
	});
});
