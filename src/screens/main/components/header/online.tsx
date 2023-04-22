import * as React from 'react';

import Icon from '@wcpos/components/src/icon';
import useOnlineStatus from '@wcpos/hooks/src/use-online-status';

import { t } from '../../../../lib/translations';

type OnlineState = {
	type: 'success' | 'warning' | 'critical';
	tooltip: string;
};

const Online = () => {
	const { isConnected, isInternetReachable } = useOnlineStatus();

	const state: OnlineState = React.useMemo(() => {
		if (!isConnected) {
			return {
				type: 'critical',
				tooltip: t('No internet connection', { _tags: 'core' }),
			};
		}
		if (!isInternetReachable) {
			return {
				type: 'warning',
				tooltip: t('Site not reachable', { _tags: 'core' }),
			};
		}
		return {
			type: 'success',
			tooltip: t('Online', { _tags: 'core' }),
		};
	}, [isConnected, isInternetReachable]);

	// if isInternetReachable is null we are still waiting for a response from the server
	if (isInternetReachable === null) {
		return null;
	}

	return (
		<Icon
			name="circle"
			size="small"
			type={state.type}
			tooltip={state.tooltip}
			tooltipPlacement="bottom"
		/>
	);
};

export default Online;
