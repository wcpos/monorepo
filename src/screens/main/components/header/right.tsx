import * as React from 'react';

import { HStack } from '@wcpos/components/src/hstack';

import Online from './online';
import { UserMenu } from './user-menu';

const HeaderRight = () => {
	return (
		<HStack>
			<Online />
			<UserMenu />
		</HStack>
	);
};

export default HeaderRight;
