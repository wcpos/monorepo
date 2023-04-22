import * as React from 'react';

import Box from '@wcpos/components/src/box';

import Notifications from './notifications';
import Online from './online';
import UserMenu from './user-menu';

const HeaderRight = () => {
	return (
		<Box horizontal space="small" padding="small" align="center">
			<Online />
			{/* <Notifications /> */}
			<UserMenu />
		</Box>
	);
};

export default HeaderRight;
