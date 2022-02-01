import axios from 'axios';
import useAppState from './use-app-state';

const useRestHttpClient = () => {
	const { site, wpCredentials } = useAppState();

	const headers = {
		'X-WCPOS': '1',
	};
	if (wpCredentials.wpNonce) {
		Object.assign(headers, { 'X-WP-Nonce': wpCredentials.wpNonce });
	}
	if (wpCredentials.jwt) {
		Object.assign(headers, { Authorization: `Bearer ${wpCredentials.jwt}` });
	}

	const restHttpClient = axios.create({
		baseURL: site.wcApiUrl,
		headers,
	});

	return restHttpClient;
};

export default useRestHttpClient;
