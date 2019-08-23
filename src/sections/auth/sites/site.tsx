import React from 'react';
import Avatar from '../../../components/avatar';
import Text from '../../../components/text';
import Icon from '../../../components/icon';
import useNavigation from '../../../hooks/use-navigation';
import useDatabase from '../../../hooks/use-database';
import { SiteWrapper, SiteTextWrapper } from './styles';

type Props = {
	site: typeof import('../../../store/models/site');
};

/**
 * Case 1
 * - No users
 * - 1 option: Connect new user
 *
 * Case 2
 * - One user, no stores
 * - 2 options: Enter site or connect new user
 *
 * Case 3
 * - One user, two or more stores
 * - Multiple options: Enter store or connect new user
 *
 * Case 4
 * - Two or more users, two or more stores
 * - Enter options for each store-user combination, also connect new user
 */

const Site = ({ site }: Props) => {
	const navigation = useNavigation();
	const { sitesDB } = useDatabase();

	const handleRemove = async () => {
		await sitesDB.action(async () => {
			site.destroyPermanently();
		});
	};

	const handleNewUser = async () => {
		const user = await sitesDB.action(async () => {
			return await site.users.collection.create((user: any) => {
				user.site.set(site);
			});
		});
		navigation.navigate('Modal', { site, user });
	};

	const renderEnterButtons = () => {
		// this could be a query
		// - join users and stores where store user = user
		if (site.users.length === 1) {
			// single connected user
			return <Text>Enter store as {site.users[0].name}</Text>;
		} else if (site.users.length > 1) {
			// multiple users
			return site.users.map(user => {
				return <Text>Enter store as {user.name}</Text>;
			});
		}
	};

	return (
		<SiteWrapper>
			<Avatar src="https://picsum.photos/200/200/" />
			<SiteTextWrapper>
				<Text>{site.name}</Text>
				<Text>{site.url}</Text>
				<Text>{site.connection_status.message}</Text>
				{renderEnterButtons()}
				<Text onPress={handleNewUser}>Authenticate new user</Text>
			</SiteTextWrapper>
			<Icon name="remove" onPress={handleRemove} />
		</SiteWrapper>
	);
};

export default Site;
