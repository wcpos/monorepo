import React from 'react';
import Avatar from '../../../components/avatar';
import Text from '../../../components/text';
import Icon from '../../../components/icon';
import useNavigation from '../../../hooks/use-navigation';
import useObservable from '../../../hooks/use-observable';
import { SiteWrapper, SiteTextWrapper } from './styles';
import User from './user';

type Props = {
	site: typeof import('../../../database/models/site');
};

const Site = ({ site }: Props) => {
	const navigation = useNavigation();

	const users = useObservable(site.users.observe(), []);

	const handleRemove = async () => {
		await site.destroy();
	};

	const handleNewUser = async () => {
		const user = await site.collection.database.action(async () => {
			return await site.users.collection.create((user: any) => {
				user.site.set(site);
			});
		});
		navigation.navigate('Modal', { site, user });
	};

	return (
		<SiteWrapper>
			<Avatar src="https://picsum.photos/200/200/" />
			<SiteTextWrapper>
				<Text>{site.name}</Text>
				<Text>{site.url}</Text>
				<Text>{site.connection_status.message}</Text>
				{users.map(user => (
					<User key={user.id} user={user} />
				))}
				<Text onPress={handleNewUser}>Authenticate new user</Text>
			</SiteTextWrapper>
			<Icon name="remove" onPress={handleRemove} />
		</SiteWrapper>
	);
};

export default Site;
