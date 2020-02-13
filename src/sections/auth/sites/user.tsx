import React from 'react';
import Text from '../../../components/text';
import Icon from '../../../components/icon';
import { UserWrapper } from './styles';
import useDatabaseContext from '../../../hooks/use-database-context';

type Props = {
	user: typeof import('../../../database/models/user');
};

const User = ({ user }: Props) => {
	const { setUser } = useDatabaseContext();

	const handleRemove = async () => {
		await user.collection.database.action(async () => {
			user.destroyPermanently();
		});
	};

	const onEnter = () => {
		setUser(user);
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
