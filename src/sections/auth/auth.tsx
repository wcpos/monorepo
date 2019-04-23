import React from 'react';
import Segment from '../../components/segment';
import TextInput from '../../components/textinput';
import Text from '../../components/text';
import Avatar from '../../components/avatar';
import List, { ListItem } from '../../components/list';
import { AuthView } from './styles';
import useDatabase from '../../hooks/use-database';
import useObservable from '../../hooks/use-observable';
import Icon from '../../components/icon';
import Site from './site';

type Props = {
	navigation: import('react-navigation').NavigationScreenProp<{}, {}>;
};

const Connection = ({
	status = 'loading',
	message = 'Loading',
}: {
	status: 'loading' | 'success' | 'error';
	message: string;
}) => (
	<>
		<Icon name={status} /> <Text>{message}</Text>
	</>
);

const Auth = ({ navigation }: Props) => {
	const database = useDatabase();

	const sites = useObservable(
		database.collections
			.get('sites')
			.query()
			.observeWithColumns(['name', 'connection_status']),
		[]
	);
	// const sites = database.collections
	// 	.get('sites')
	// 	.query()
	// 	.fetch();

	const handleConnect = async (url: string) => {
		const trimUrl = url.replace(/^.*:\/{2,}|\s/g, '');
		if (trimUrl) {
			const site = await database.action(async () => {
				return await database.collections.get('sites').create(site => {
					site.url = 'https://' + trimUrl; // force https
				});
			});
			site.api.connect();
		}
	};

	const renderSite = item => <Site site={item} key={item.id} />;

	return (
		<AuthView>
			<Segment style={{ width: 460 }}>
				<Text size="large">Connect</Text>
				<Text>Enter the URL of your WooCommerce store:</Text>
				<TextInput
					prefix="https://"
					action="Connect"
					onAction={handleConnect}
					keyboardType="url"
					cancellable={true}
				/>
			</Segment>
			{sites && sites.length > 0 && (
				<Segment style={{ width: 460 }}>
					<List items={sites} renderItem={renderSite} />
				</Segment>
			)}
		</AuthView>
	);
};

export default Auth;
