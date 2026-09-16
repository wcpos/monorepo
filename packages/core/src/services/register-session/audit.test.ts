import { getLogger } from '@wcpos/utils/logger';

import {
	logApprovalGranted,
	logApprovalRefused,
	logDrawerOpened,
	logVarianceOverThreshold,
	logXReportPrinted,
} from './audit';

jest.mock('../../contexts/app-state', () => ({ useStoreSession: jest.fn() }));
const logger = jest.mocked(getLogger(['wcpos', 'registerSession']));
const actor = { id: '7', name: 'Pat' };
const input = { actor, sessionId: 's', registerId: 'r' };
beforeEach(() => jest.clearAllMocks());

it('logs approval granted with the requesting cashier and approver id', () => {
	logApprovalGranted({ ...input, approvedBy: 8 });
	expect(logger.info).toHaveBeenCalledWith('Register session approval granted', {
		actor,
		context: { type: 'register.approval-granted', sessionId: 's', registerId: 'r', approvedBy: 8 },
	});
});

it('logs approval refused with the requesting cashier', () => {
	logApprovalRefused(input);
	expect(logger.warn).toHaveBeenCalledWith('Register session approval refused', {
		actor,
		context: { type: 'register.approval-refused', sessionId: 's', registerId: 'r' },
	});
});

it('logs the variance and threshold with the cashier', () => {
	logVarianceOverThreshold({ ...input, variance: '10.00', threshold: '5' });
	expect(logger.warn).toHaveBeenCalledWith('Register count exceeds variance threshold', {
		actor,
		context: {
			type: 'register.variance-over-threshold',
			sessionId: 's',
			registerId: 'r',
			variance: '10.00',
			threshold: '5',
		},
	});
});

it('logs X-report dispatch with the cashier', () => {
	logXReportPrinted(input);
	expect(logger.info).toHaveBeenCalledWith('Register X-report print dispatched', {
		actor,
		context: { type: 'register.x-report-printed', sessionId: 's', registerId: 'r' },
	});
});

it('logs drawer dispatch with the cashier', () => {
	logDrawerOpened(input);
	expect(logger.info).toHaveBeenCalledWith('Register drawer kick dispatched', {
		actor,
		context: { type: 'register.drawer-opened', sessionId: 's', registerId: 'r' },
	});
});
