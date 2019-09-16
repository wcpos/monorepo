import React from 'react';
import Menu from '../../components/menu';

const UserMenu = () => {
	return <Menu items={[{ label: 'Settings' }, { label: 'Logout' }]} />;
};

export default UserMenu;
