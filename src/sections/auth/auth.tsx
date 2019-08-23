import React from 'react';
import Segment from '../../components/segment';
import TextInput from '../../components/textinput';
import Text from '../../components/text';
import { AuthView } from './styles';
import useDatabase from '../../hooks/use-database';
// import useObservable from '../../hooks/use-observable';
import Icon from '../../components/icon';
import Sites from './sites';
// import { sitesDatabase } from '../../database';

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
	// const { sites } = useAuth();
	const { sitesDB } = useDatabase();

	// const sites = useObservable(
	// 	database.collections
	// 		.get('sites')
	// 		.query()
	// 		.observeWithColumns(['name', 'connection_status']),
	// 	[]
	// );
	// const sites = database.collections
	// 	.get('sites')
	// 	.query()
	// 	.fetch();

	const handleConnect = async (url: string) => {
		const trimUrl = url.replace(/^.*:\/{2,}|\s|\/+$/g, '');
		if (trimUrl) {
			const site = await sitesDB.action(async () => {
				return await sitesDB.collections.get('sites').create(site => {
					site.url = trimUrl;
				});
			});
			site.connect();
		}
	};

	const handleDirectLink = () => {
		navigation.navigate('POS');
	};

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
			<Sites />
			<Text onPress={handleDirectLink}>Go to POS</Text>
		</AuthView>
	);
};

export default Auth;
