import React from 'react';
import Menu from '../../components/menu';

interface Props {}

const UserMenu: React.FC<Props> = () => {
	return <Menu items={[{ label: 'Settings' }, { label: 'Logout' }]} />;
};

export default UserMenu;
