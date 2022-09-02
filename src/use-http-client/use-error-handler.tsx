import * as React from 'react';
import { AxiosResponse } from 'axios';
import { useNavigation } from '@react-navigation/native';
import useSnackbar from '@wcpos/components/src/snackbar';

/**
 *
 */
export const useErrorResponseHandler = () => {
	const navigation = useNavigation();
	const addSnackbar = useSnackbar();

	/**
	 *
	 */
	const errorResponseHandler = React.useCallback(
		(res: AxiosResponse) => {
			if (!res) {
				console.log('CORS error?');
				addSnackbar({ message: 'Server is unavailable' });
				return;
			}

			switch (res.status) {
				case 0:
					/**
					 * This can happen for self-signed certificates, eg: development servers
					 * The solution for web is to go to the site and manually trust the certificate
					 * @TODO - what happens on desktop and mobile?
					 */
					addSnackbar({ message: 'The certificate for this server is invalid.' });
					break;
				case 400:
					addSnackbar({ message: res.data.message });
					break;
				case 401:
				case 403:
					if (res.data) {
						/**
						 * @TODO - Errors may be better in a global Dialog component, like Snackbar?
						 */
						addSnackbar({
							message: `Recieved "${res.data.message}" when trying to access endpoint: ${res.config.url}`,
							// type: 'critical',
						});
					} else {
						navigation.navigate('Login');
					}
					break;
				case 404:
					console.log('404 error', res);
					break;
				case 500:
					console.log('500 Internal server error', res);
					break;
				default:
					console.log('Unknown error', res);
			}
		},
		[addSnackbar, navigation]
	);

	return errorResponseHandler;
};
