import * as React from 'react';
import useOnlineStatus from '@wcpos/common/src/hooks/use-online-status';
import Icon from '@wcpos/common/src/components/icon';

const Online = () => {
	const { isConnected, isInternetReachable } = useOnlineStatus();

	let state = {
		type: 'critical',
		message: 'No internet connection',
	};

	if (isConnected) {
		state = {
			type: 'warning',
			message: 'Site not reachable',
		};
	}

	if (isConnected && isInternetReachable) {
		state = {
			type: 'success',
			message: 'Online',
		};
	}

	return (
		<Icon
			name="circle"
			size="small"
			type={state.type}
			tooltip={state.message}
			tooltipPlacement="bottom"
		/>
	);
};

export default Online;
