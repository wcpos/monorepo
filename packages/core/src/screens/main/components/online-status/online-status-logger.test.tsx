/** @jest-environment jsdom */
jest.mock('@wcpos/utils/logger', () => {
	const actual = jest.requireActual<typeof import('@wcpos/utils/logger')>('@wcpos/utils/logger');
	const logger = {
		error: jest.fn(),
		warn: jest.fn(),
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

import { render } from '@testing-library/react';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';

import { OnlineStatusLogger } from './online-status-logger';
/* eslint-enable import/first */

jest.mock('@wcpos/hooks/use-online-status', () => ({ useOnlineStatus: jest.fn() }));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

const mockUseOnlineStatus = jest.mocked(useOnlineStatus);
const { __logger: logger } = jest.requireMock('@wcpos/utils/logger') as {
	__logger: { error: jest.Mock; warn: jest.Mock; success: jest.Mock };
};

describe('OnlineStatusLogger', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockUseOnlineStatus.mockReturnValue({ status: 'online-website-unavailable' });
	});

	it('does not log on initial mount', () => {
		render(<OnlineStatusLogger />);

		expect(logger.warn).not.toHaveBeenCalled();
		expect(logger.error).not.toHaveBeenCalled();
		expect(logger.success).not.toHaveBeenCalled();
	});

	it('logs once, at warn, when the device goes offline', () => {
		const { rerender } = render(<OnlineStatusLogger />);
		mockUseOnlineStatus.mockReturnValue({ status: 'offline' });

		rerender(<OnlineStatusLogger />);

		expect(logger.warn).toHaveBeenCalledTimes(1);
		expect(logger.warn).toHaveBeenCalledWith('Device went offline', {
			code: 'SYNC999',
			context: { type: 'connectivity.device-offline' },
			showToast: true,
			toast: { title: 'common.device_went_offline' },
		});
		// warn, never error: `error` reaches console.error on native, where the expo
		// dev client draws a full-screen redbox over the app on a transient blip
		// (class 13). Offline is an expected, self-healing state in an offline-first
		// POS — the LEVELS.md `warn` promise, not the `error` one.
		expect(logger.error).not.toHaveBeenCalled();
	});

	it('logs once when the connection is restored', () => {
		const { rerender } = render(<OnlineStatusLogger />);
		mockUseOnlineStatus.mockReturnValue({ status: 'online-website-available' });

		rerender(<OnlineStatusLogger />);

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

		expect(logger.warn).toHaveBeenCalledTimes(1);
		expect(logger.error).not.toHaveBeenCalled();
		expect(logger.success).not.toHaveBeenCalled();
	});
});
