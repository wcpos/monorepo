import React from 'react';
import { useRoute, useNavigation } from '@react-navigation/native';
import Header from '../header';
import Button from '../../components/button';
import Popover from '../../components/popover';
import UserMenu from './user-menu';

interface Props {}

const MasterBar: React.FC<Props> = () => {
	const route = useRoute();
	const navigation = useNavigation();

	return (
		<Header
			title={route.name}
			left={<Button title="Menu" onPress={() => navigation.openDrawer()} />}
			right={
				<Popover content={<UserMenu />}>
					<Button title="User" />
				</Popover>
			}
		/>
	);
};

export default MasterBar;
