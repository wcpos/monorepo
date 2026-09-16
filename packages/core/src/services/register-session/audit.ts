import * as React from 'react';

import { getLogger } from '@wcpos/utils/logger';

import { useStoreSession } from '../../contexts/app-state';

const logger = getLogger(['wcpos', 'registerSession']);

export function useRegisterActor() {
	const { wpCredentials } = useStoreSession();
	return React.useMemo(
		() => ({
			id: String(wpCredentials.id ?? ''),
			name: wpCredentials.display_name || wpCredentials.username || '',
		}),
		[wpCredentials.id, wpCredentials.display_name, wpCredentials.username]
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
		context: { type: 'register.approval-refused', ...context },
	});
}

export function logVarianceOverThreshold({
	actor,
	...context
}: RegisterAction & { variance: string; threshold: string | undefined }) {
	logger.warn('Register count exceeds variance threshold', {
		actor,
		context: { type: 'register.variance-over-threshold', ...context },
	});
}

export function logXReportPrinted({ actor, ...context }: RegisterAction) {
	logger.info('Register X-report print dispatched', {
		actor,
		context: { type: 'register.x-report-printed', ...context },
	});
}

export function logDrawerOpened({ actor, ...context }: RegisterAction) {
	logger.info('Register drawer kick dispatched', {
		actor,
		context: { type: 'register.drawer-opened', ...context },
	});
}
