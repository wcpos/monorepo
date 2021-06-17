import * as React from 'react';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import Icon from '@wcpos/common/src/components/icon';

export const Online = () => {
	const { online } = useAppState();

	return <Icon name="circle" size="x-small" color={online ? 'green' : 'red'} />;
};
