import React from 'react';
import Segment from '../../components/segment';
import TextInput from '../../components/textinput';
import Text from '../../components/text';
import Avatar from '../../components/avatar';
import List, { ListItem } from '../../components/list';
import { AuthView } from './styles';
import ApiService from '../../services/api';
import useDatabase from '../../hooks/use-database';
import useObservable from '../../hooks/use-observable';

type Props = {
	navigation: import('react-navigation').NavigationScreenProp<{}, {}>;
};

type ActionTypes = import('../../services/api').ActionTypes;

/**
 * Error messages
 *
 * wp_api/ERROR: Network Error
 * Possible CORS error, WooCommerce POS plugin needs to be installed to add Access-Control-Allow-Origin
 *
 *
 */

function reducer(state, action: { type: ActionTypes; payload?: any }) {
	let key: 'wc_api' | 'wp_api' | 'wcpos_api';
	let type: 'FETCH' | 'SUCCESS' | 'ERROR';
	// @ts-ignore
	[key, type] = action.type.split('/');

	const map = {
		wp_api: 'WordPress',
		wc_api: 'WooCommerce',
		wcpos_api: 'WooCommerce POS',
	};

	switch (type) {
		case 'FETCH':
			return {
				...state,
				[key]: { label: `Checking ${map[key]} ...`, icon: 'loading' },
			};
		case 'SUCCESS':
			return {
				...state,
				[key]: {
					label: `${map[key]} found!`,
					icon: 'completed',
					info: action.payload.message,
				},
			};
		case 'ERROR':
			return {
				...state,
				[key]: { label: `${map[key]} error!`, icon: 'error', info: action.payload.error.message },
			};
		default:
			throw new Error();
	}
}

const Auth = ({ navigation }: Props) => {
	const [checks, dispatch] = React.useReducer(reducer, {
		wp_api: false,
		wc_api: false,
		wcpos_api: false,
	});

	const database = useDatabase();

	const sites = useObservable(
		database.collections
			.get('sites')
			.query()
			.observeWithColumns(['name', 'status']),
		[]
	);

	const handleConnect = async (url: string) => {
		// const site = await database.collections.get('sites').create(site => {
		// 	site.url = url;
		// });
		await database.action(async () => {
			const site = await database.collections.get('sites').create(site => {
				site.url = 'https://' + url.replace(/^(.*:\/\/)/, '');
			});
			// site.api.connect();
		});

		// const api = new ApiService(url);
		// api.connection$.subscribe(
		// 	data => {
		// 		if (data.type === 'wcpos_api/FETCH') {
		// 			navigation.navigate('Modal', { url: data.payload });
		// 		}
		// 		dispatch(data);
		// 	},
		// 	error => {
		// 		dispatch(error);
		// 	},
		// 	() => {
		// 		api.connection$.unsubscribe();
		// 	}
		// );
		// api.connect();
	};

	const renderSite = item => (
		<ListItem
			key={item.id}
			label={item.name || item.url}
			info={item.url}
			icon={item.icon}
			action="Remove"
			onPress={() => {
				item.api.connect();
			}}
			onAction={() => {
				item.destroyPermanently();
			}}
		/>
	);

	return (
		<AuthView>
			<Segment>
				<Text size="large">Connect</Text>
				<Text>Enter the URL of your WooCommerce store:</Text>
				<TextInput prefix="https://" action="Connect" onAction={handleConnect} keyboardType="url" />
			</Segment>
			{sites && sites.length > 0 && (
				<Segment>
					<List items={sites} renderItem={renderSite} />
				</Segment>
			)}
		</AuthView>
	);
};

export default Auth;
