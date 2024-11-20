import * as React from 'react';

import { Icon } from '@wcpos/components/src/icon';
import { Text } from '@wcpos/components/src/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/src/tooltip';
import useOnlineStatus from '@wcpos/hooks/src/use-online-status';

import { useT } from '../../../../contexts/translations';

type OnlineState = {
	type: 'success' | 'warning' | 'destructive';
	tooltip: string;
};

const Online = () => {
	const { isConnected, isInternetReachable } = useOnlineStatus();
	const t = useT();

	const state: OnlineState = React.useMemo(() => {
		if (!isConnected) {
			return {
				type: 'destructive',
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
				<Icon name="circle" className={`text-${state.type}`} />
			</TooltipTrigger>
			<TooltipContent side="bottom">
				<Text>{state.tooltip}</Text>
			</TooltipContent>
		</Tooltip>
	);
};

export default Online;
