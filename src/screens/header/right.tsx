import * as React from 'react';
import Box from '@wcpos/common/src/components/box';
import UserMenu from './user-menu';
import Online from './online';
import Notifications from './notifications';
import * as Styled from './styles';

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
