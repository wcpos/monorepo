import React from 'react';
import Segment from '../../components/segment';
import TextInput from '../../components/textinput';
import Text from '../../components/text';
import Avatar from '../../components/avatar';
import List, { ListItem } from '../../components/list';
import { AuthView } from './styles';
import axios, { noConfigAxios } from '../../lib/axios';
import parseLinkHeader from '../../lib/parse-link-header';

type Props = {
	navigation: import('react-navigation').NavigationScreenProp<{}, {}>;
};

function connect(url, dispatch) {
	dispatch({
		type: 'loading',
		payload: {
			label: 'Check WordPress',
			icon: 'loading',
		},
	});
	noConfigAxios
		.head('http://dev.local/wp/latest/')
		.then(response => {
			// See https://developer.wordpress.org/rest-api/using-the-rest-api/discovery/
			const link = response.headers && response.headers.link;
			const parsed = parseLinkHeader(link);
			if ('https://api.w.org/' in parsed) {
				const { url } = parsed['https://api.w.org/'];
				console.log('WP API found: ', url);
				dispatch({
					type: 'success',
					payload: {
						label: 'Check WordPress',
						icon: 'completed',
					},
				});
			}
		})
		.catch(error => {
			if (error.response) {
				// The request was made and the server responded with a status code
				// that falls out of the range of 2xx
				console.log(error.response.data);
				console.log(error.response.status);
				console.log(error.response.headers);
			} else if (error.request) {
				// The request was made but no response was received
				// `error.request` is an instance of XMLHttpRequest in the browser and an instance of
				// http.ClientRequest in node.js
				console.log(error.request);
			} else {
				// Something happened in setting up the request that triggered an Error
				console.log('Error', error.message);
			}
			console.log(error.config);
		});
}

function reducer(state, action) {
	switch (action.type) {
		case 'loading':
			return [...state, action.payload];
		case 'success':
			return [...state, action.payload];
		case 'error':
			return [...state, action.payload];
		default:
			throw new Error();
	}
}

const Auth = ({ navigation }: Props) => {
	const [checks, dispatch] = React.useReducer(reducer, []);

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
				<TextInput
					prefix="https://"
					action="Connect"
					onAction={value =>
						connect(
							value,
							dispatch
						)
					}
				/>
				<List items={checks} />
			</Segment>
			<Segment>
				<List items={sites} renderItem={renderSite} />
			</Segment>
		</AuthView>
	);
};

export default Auth;
