import * as React from 'react';

import { HStack } from '@wcpos/components/hstack';

import { NotificationBell } from './notification-bell';
import { Online } from './online';
import { UserMenu } from './user-menu';

const HeaderRight = () => {
	return (
		<HStack space="lg">
			<Online />
			<NotificationBell />
			<UserMenu />
		</HStack>
	);
};

export default HeaderRight;
