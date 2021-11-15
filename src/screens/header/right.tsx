import * as React from 'react';
import UserMenu from './user-menu';
import Online from './online';
import Notifications from './notifications';
import * as Styled from './styles';

const HeaderRight = () => {
	return (
		<Styled.RightContainer>
			<Online />
			<Notifications />
			<UserMenu />
		</Styled.RightContainer>
	);
};

export default HeaderRight;
