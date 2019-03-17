import React, { Component } from 'react';
import { View } from 'react-native';
import Button from './components/button';
import Text from './components/text';
import axios, { noConfigAxios } from './lib/axios';
import parseLinkHeader from './lib/parse-link-header';

// /wc-auth/v1/authorize

// const url =
//   'http://localhost/wp/latest/wc-auth/v1/authorize?' +
//   queryString.stringify({
//     app_name: 'WooCommerce POS',
//     scope: 'read_write',
//     user_id: 123,
//     return_url: 'http://dev.local',
//     callback_url: 'https://dev.local',
//   });

interface Props {
	homepage?: string;
	navigation?: any;
}

interface State {
	isLoading: boolean;
	wcApiUrl: string;
}

/**
 *
 */
class Login extends Component<Props, State> {
	state = {
		isLoading: false,
		wcApiUrl: '',
	};

	handleConnect = () => {
		this.setState({ isLoading: true });

		// send simple HEAD request to URL
		noConfigAxios
			.head('http://dev.local/wp/latest/')
			.then(response => {
				// See https://developer.wordpress.org/rest-api/using-the-rest-api/discovery/
				const link = response.headers && response.headers.link;
				const parsed = parseLinkHeader(link);
				if ('https://api.w.org/' in parsed) {
					const { url } = parsed['https://api.w.org/'];
					console.log('WP API found: ', url);
					axios
						.get(url)
						.then(res => {
							const namespaces = res.data && res.data.namespaces;
							if (namespaces.includes('wc/v3')) {
								console.log('WC API v3 found: ', url + 'wc/v3');
								this.setState({ wcApiUrl: url + 'wc/v3' });
								console.log(res.data.authentication);
							} else {
								console.log('WC API not found');
							}
						})
						.catch(error => {
							console.log(error);
						});
				} else {
					console.log('WP API not found');
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
	};

	render() {
		const { isLoading, wcApiUrl } = this.state;
		return (
			<View>
				<Button onPress={this.handleConnect} title="Connect" loading={isLoading} />
				<Text>WC API found: {wcApiUrl}</Text>
				<Button onPress={() => this.props.navigation.navigate('App')} title="Go to App" />
				<Text>{React.version}</Text>
			</View>
		);
	}
}

export default Login;
