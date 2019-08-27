import React from 'react';
import Text from '../../../components/text';
import Icon from '../../../components/icon';
import { UserWrapper } from './styles';
import useDatabase from '../../../hooks/use-database';
import useNavigation from '../../../hooks/use-navigation';

type Props = {
	user: typeof import('../../../database/models/user');
};

const User = ({ user }: Props) => {
	const { switchStoreDB } = useDatabase();
	const navigation = useNavigation();

	const handleRemove = async () => {
		await user.collection.database.action(async () => {
			user.destroyPermanently();
		});
	};

	const onEnter = () => {
		switchStoreDB({ site: user.site.id, user: user.id });
		navigation.navigate('POS');
	};

	return (
		<UserWrapper>
			<Text onPress={onEnter}>Enter store as {user.username || user.id}</Text>
			<Text>{user.isAuthenticated() ? 'yes' : 'no'}</Text>
			<Icon name="remove" onPress={handleRemove} />
		</UserWrapper>
	);
};

export default User;
