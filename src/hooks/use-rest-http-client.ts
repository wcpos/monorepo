import axios from 'axios';
import useAppState from './use-app-state';

const useRestHttpClient = () => {
	const { site, wpCredentials } = useAppState();

	if (!site || !wpCredentials) {
		return;
	}

	const headers = {
		'X-WCPOS': '1',
	};
	if (wpCredentials.wp_nonce) {
		Object.assign(headers, { 'X-WP-Nonce': wpCredentials.wp - nonce });
	}
	if (wpCredentials.jwt) {
		Object.assign(headers, { Authorization: `Bearer ${wpCredentials.jwt}` });
	}

	const restHttpClient = axios.create({
		baseURL: site.wc_api_url,
		headers,
	});

	return restHttpClient;
};

export default useRestHttpClient;
