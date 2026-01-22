import * as React from 'react';

import { HStack } from '@wcpos/components/hstack';

import { NotificationBell } from './notification-bell';
import { Online } from './online';
import { UserMenu } from './user-menu';

const HeaderRight = () => {
	return (
		<HStack className="gap-0">
			<Online />
			<NotificationBell />
			<UserMenu />
		</HStack>
	);
};

export default HeaderRight;
