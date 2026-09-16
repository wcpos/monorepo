import * as React from 'react';

import { getLogger } from '@wcpos/utils/logger';

import { mintUuid } from '../register/register-document';
import { useStoreSession } from '../../contexts/app-state';

const logger = getLogger(['wcpos', 'registerSession']);

/**
 * Each attempt is its own audit entry. The logger folds rows with the same
 * level, message, actor and operationId within a minute into one row with a
 * count, which would keep only the FIRST variance when a cashier re-counts and
 * tries again; a fresh operationId per attempt defeats that.
 */
const attempt = () => ({ operationId: mintUuid().replace(/-/g, '') });

export function useRegisterActor() {
	const { wpCredentials } = useStoreSession();
	return React.useMemo(
		() => ({
			id: String(wpCredentials?.id ?? ''),
			name: wpCredentials?.display_name || wpCredentials?.username || '',
		}),
		[wpCredentials?.id, wpCredentials?.display_name, wpCredentials?.username]
	);
}

type RegisterAction = {
	actor: ReturnType<typeof useRegisterActor>;
	sessionId: string | undefined;
	registerId: string | undefined;
};

export function logApprovalGranted({
	actor,
	...context
}: RegisterAction & { approvedBy: number | null }) {
	logger.info('Register session approval granted', {
		actor,
		context: { type: 'register.approval-granted', ...context },
	});
}

export function logApprovalRefused({ actor, ...context }: RegisterAction) {
	logger.warn('Register session approval refused', {
		actor,
		terminal: attempt(),
		context: { type: 'register.approval-refused', ...context },
	});
}

export function logVarianceOverThreshold({
	actor,
	...context
}: RegisterAction & { variance: string; threshold: string | undefined }) {
	logger.warn('Register count exceeds variance threshold', {
		actor,
		terminal: attempt(),
		context: { type: 'register.variance-over-threshold', ...context },
	});
}

export function logXReportPrinted({ actor, ...context }: RegisterAction) {
	logger.info('Register X-report print dispatched', {
		actor,
		terminal: attempt(),
		context: { type: 'register.x-report-printed', ...context },
	});
}

export function logDrawerOpened({ actor, ...context }: RegisterAction) {
	logger.info('Register drawer kick dispatched', {
		actor,
		terminal: attempt(),
		context: { type: 'register.drawer-opened', ...context },
	});
}
