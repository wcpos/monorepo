import React from 'react';
import Avatar from '../../../components/avatar';
import Text from '../../../components/text';
import Icon from '../../../components/icon';
import ErrorBoundary from '../../../components/error';
import useObservable from '../../../hooks/use-observable';
import { SiteWrapper, SiteTextWrapper } from './styles';
import User from './user';

/**
 * Options for fetching favicons
 * - https://api.statvoo.com/favicon/?url=${url}
 * - https://www.google.com/s2/favicons?domain=${url}
 * - https://favicongrabber.com/api/grab/${url}
    
 * - https://api.faviconkit.com/${url}/144
 */

const Site = ({ site }) => {
	// const site$ = useObservable(site.observeWithColumns(['url']), []);
	// const users = useObservable(site.users.observe(), []);

	const handleRemove = async () => {
		await site.destroy();
	};

	const handleNewUser = async () => {
		// const user = await site.collection.database.action(async () => {
		// 	return await site.users.collection.create((user: any) => {
		// 		user.site.set(site);
		// 	});
		// });
	};

	return (
		<SiteWrapper>
			<ErrorBoundary>
				<React.Suspense fallback={<Icon name="remove" />}>
					<Avatar src={`https://api.faviconkit.com/${site.getUrl('')}/144`} />
				</React.Suspense>
			</ErrorBoundary>

			<SiteTextWrapper>
				<Text>{site.name}</Text>
				<Text
					onPress={() => {
						site.connect();
					}}
				>
					{site.url}
				</Text>
				<Text>{site.connection_status?.message}</Text>
				{/* {users.map(user => (
					<User key={user.id} user={user} />
				))} */}
				{/* <Text onPress={handleNewUser}>Authenticate new user</Text> */}
			</SiteTextWrapper>
			<Icon name="remove" onPress={handleRemove} />
		</SiteWrapper>
	);
};

export default Site;
