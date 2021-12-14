import * as React from 'react';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import Icon from '@wcpos/common/src/components/icon';

const Online = () => {
	const { online } = useAppState();

	return (
		<Icon
			name="circle"
			size="small"
			type={online ? 'success' : 'critical'}
			tooltip={online ? 'Online' : 'Offline'}
			tooltipPlacement="bottom"
		/>
	);
};

export default Online;
