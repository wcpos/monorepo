import * as React from 'react';

import { HStack } from '@wcpos/tailwind/src/hstack';

import Notifications from './notifications';
import Online from './online';
import { UserMenu } from './user-menu';

const HeaderRight = () => {
	return (
		<HStack className="mr-2">
			<Online />
			{/* <Notifications /> */}
			<UserMenu />
		</HStack>
	);
};

export default HeaderRight;
