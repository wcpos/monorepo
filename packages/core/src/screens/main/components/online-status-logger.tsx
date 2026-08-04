import * as React from 'react';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { getLogger } from '@wcpos/utils/logger';
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
		const logConfig = { showToast: true, saveToDb: true };
		switch (status) {
			case 'offline':
				logger.error(t('common.device_went_offline'), logConfig);
				break;
			case 'online-website-unavailable':
				logger.error(t('common.website_is_unreachable'), logConfig);
				break;
			case 'online-website-available':
				logger.success(t('common.connection_restored'), logConfig);
				break;
		}
		prevStatusRef.current = status;
	}, [status, t]);

	return null;
}
