import React from 'react';
import Segment from '../../components/segment';
import TextInput from '../../components/textinput';
import Text from '../../components/text';
import Avatar from '../../components/avatar';
import List, { ListItem } from '../../components/list';
import { AuthView } from './styles';
import ApiService from '../../services/api';

type Props = {
	navigation: import('react-navigation').NavigationScreenProp<{}, {}>;
};

type ActionTypes = import('../../services/api').ActionTypes;

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

	const sites = [
		{
			name: 'Site 1',
			url: 'https://demo.wcpos.com',
			icon: <Avatar src="https://demo.wcpos.com/favicon.ico" />,
		},
		{
			name: 'Site 2',
			url: 'https://beta.wcpos.com',
			icon: <Avatar src="https://demo.wcpos.com/favicon.ico" />,
		},
	];

	// const checks = [
	// 	{ label: 'Check WordPress', icon: 'completed' },
	// 	{ label: 'Check WooCommerce', icon: 'error' },
	// 	{ label: 'Check WooCommerce POS', icon: 'loading' },
	// ];

	const handleConnect = (url: string) => {
		const api = new ApiService(url);

		api.connection$.subscribe(
			data => {
				if (data.type === 'wcpos_api/FETCH') {
					navigation.navigate('Modal', { url: data.payload });
				}
				dispatch(data);
			},
			error => {
				dispatch(error);
			},
			() => {
				api.connection$.unsubscribe();
			}
		);

		api.connect();
	};

	const renderSite = item => (
		<ListItem
			label={item.name}
			info={item.url}
			icon={item.icon}
			action="Remove"
			onPress={event => {
				console.log(event);
			}}
			onAction={event => {
				console.log(event);
			}}
		/>
	);

	return (
		<AuthView>
			<Segment>
				<Text size="large">Connect</Text>
				<Text>Enter the URL of your WooCommerce store:</Text>
				<TextInput prefix="https://" action="Connect" onAction={handleConnect} keyboardType="url" />
				<List items={Object.values(checks).filter(item => item)} />
			</Segment>
			<Segment>
				<List items={sites} renderItem={renderSite} />
			</Segment>
		</AuthView>
	);
};

export default Auth;
