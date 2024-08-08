import * as React from 'react';

import { HStack } from '@wcpos/tailwind/src/hstack';

import Online from './online';
import { UserMenu } from './user-menu';

const HeaderRight = () => {
	return (
		<HStack className="mr-2">
			<Online />
			<UserMenu />
		</HStack>
	);
};

export default HeaderRight;
