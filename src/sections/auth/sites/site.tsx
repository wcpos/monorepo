import React from 'react';
import Avatar from '../../../components/avatar';
import Text from '../../../components/text';
import Icon from '../../../components/icon';
import Button from '../../../components/button';
import ErrorBoundary from '../../../components/error';
import useObservable from '../../../hooks/use-observable';
import { SiteWrapper, SiteTextWrapper } from './styles';
import User from './user';
import AuthModal from './auth-modal';

/**
 * Options for fetching favicons
 * - https://api.statvoo.com/favicon/?url=${url}
 * - https://www.google.com/s2/favicons?domain=${url}
 * - https://favicongrabber.com/api/grab/${url}
    
 * - https://api.faviconkit.com/${url}/144
 */

const Site = ({ site }) => {
	const users = useObservable(site.users.observe(), []);
	const [visible, setVisible] = React.useState(false);

	const handleRemove = async () => {
		await site.destroy();
	};

	return (
		<SiteWrapper>
			<ErrorBoundary>
				<React.Suspense fallback={<Icon name="help" size="large" />}>
					<Avatar src={`https://api.faviconkit.com/${site.urlWithoutPrefix}/144`} />
				</React.Suspense>
			</ErrorBoundary>

			<SiteTextWrapper>
				<Text>{site.name}</Text>
				<Text
					onPress={() => {
						site.connect();
					}}
				>
					{site.urlWithoutPrefix}
				</Text>
				{/* <Text>{status?.message}</Text> */}
				{users.map(user => (
					<User key={user.id} user={user} />
				))}
				{/* <Text onPress={handleNewUser}>Authenticate new user</Text> */}
				<Button
					title="Login"
					onPress={() => {
						setVisible(true);
					}}
				/>
				<AuthModal site={site} visible={visible} setVisible={setVisible} />
			</SiteTextWrapper>
			<Icon name="remove" onPress={handleRemove} />
		</SiteWrapper>
	);
};

export default Site;
