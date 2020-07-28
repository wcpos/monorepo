import React from 'react';
import useAppState from '../use-app-state';
import WcApiService from '../../services/wc-api';

const useFetchData = (
	endpoint: string
): {
	data: any[];
	loading: boolean;
	error: boolean;
} => {
	const [{ user, storePath }] = useAppState();
	const [data, setData] = React.useState(null);
	const [loading, setLoading] = React.useState(true);
	const [error, setError] = React.useState(false);

	React.useEffect(() => {
		(async (): Promise<void> => {
			setError(false);
			setLoading(true);
			try {
				const path = storePath.split('.');
				const site = user.get(path.slice(1, 3).join('.'));
				const wpCredentials = user.get(path.slice(1, 5).join('.'));
				const api = new WcApiService({
					baseUrl: site.wc_api_url,
					collection: endpoint,
					key: wpCredentials.consumer_key,
					secret: wpCredentials.consumer_secret,
				});
				const result = await api.fetch();
				console.log(result);
				setData(result);
			} catch (error) {
				setError(true);
			}
			setLoading(false);
		})();
	}, [endpoint, user, storePath]);

	return { data, loading, error };
};

export default useFetchData;
