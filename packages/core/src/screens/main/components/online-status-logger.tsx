import * as React from 'react';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import type { OnlineStatus } from '@wcpos/hooks/use-online-status';

import { useT } from '../../../contexts/translations';

const logger = getLogger(['wcpos', 'ui', 'header']);

export function OnlineStatusLogger() {
	const { status } = useOnlineStatus();
	const t = useT();
	const prevStatusRef = React.useRef<OnlineStatus | null>(status);

	// Log status changes from this single app-level mount point.
	React.useEffect(() => {
		const prevStatus = prevStatusRef.current;
		if (prevStatus === null) {
			prevStatusRef.current = status;
			return;
		}
		if (prevStatus === status) return;
		switch (status) {
			case 'offline':
				logger.error('Device went offline', {
					code: ERROR_CODES.SYNC_UNEXPECTED,
					showToast: true,
					toast: { title: t('common.device_went_offline') },
				});
				break;
			case 'online-website-unavailable':
				logger.error('Website is unreachable', {
					code: ERROR_CODES.SYNC_UNEXPECTED,
					showToast: true,
					toast: { title: t('common.website_is_unreachable') },
				});
				break;
			case 'online-website-available':
				logger.success(t('common.connection_restored'), { showToast: true });
				break;
		}
		prevStatusRef.current = status;
	}, [status, t]);

	return null;
}
