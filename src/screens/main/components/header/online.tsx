import * as React from 'react';

import useOnlineStatus from '@wcpos/hooks/src/use-online-status';
import { Icon } from '@wcpos/tailwind/src/icon';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/tailwind/src/tooltip';

import { useT } from '../../../../contexts/translations';

type OnlineState = {
	type: 'success' | 'warning' | 'critical';
	tooltip: string;
};

const Online = () => {
	const { isConnected, isInternetReachable } = useOnlineStatus();
	const t = useT();

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
	}, [isConnected, isInternetReachable, t]);

	// if isInternetReachable is null we are still waiting for a response from the server
	if (isInternetReachable === null) {
		return null;
	}

	return (
		<Tooltip>
			<TooltipTrigger>
				<Icon name="circle" className={`fill-${state.type}`} />
			</TooltipTrigger>
			<TooltipContent side="bottom">{state.tooltip}</TooltipContent>
		</Tooltip>
	);
};

export default Online;
