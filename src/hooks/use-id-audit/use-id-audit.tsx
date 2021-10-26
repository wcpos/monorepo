import * as React from 'react';
import http from 'axios';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import { useNavigation } from '@react-navigation/native';
import get from 'lodash/get';

type CollectionNames = 'products';

const fields = {
	products: ['id', 'name'],
};

/**
 * Fetch a full list of IDs available on the server and compare to the local records
 */
const useIdAudit = (collectionName: CollectionNames) => {
	const { storeDB, site, wpCredentials } = useAppState();
	const navigation = useNavigation();

	React.useEffect(() => {
		const request = http.CancelToken.source();
		const headers = {
			'X-WCPOS': '1',
		};
		if (wpCredentials.wpNonce) {
			Object.assign(headers, { 'X-WP-Nonce': wpCredentials.wpNonce });
		}
		if (wpCredentials.jwt) {
			Object.assign(headers, { Authorization: `Bearer ${wpCredentials.jwt}` });
		}

		http
			// @ts-ignore
			.get('products', {
				baseURL: site.wcApiUrl,
				params: { fields: fields[collectionName], posts_per_page: -1 },
				headers,
			})
			.then(({ data }: any) => {
				// @ts-ignore
				return storeDB.collections[collectionName].auditIdsFromServer(data);
			})
			.catch(({ response }) => {
				console.log(response);
				if (!response) {
					console.error('CORS error');
					return;
				}
				if (response.status === 401) {
					// @ts-ignore
					navigation.navigate('Modal', { login: true });
				}
				if (response.status === 403) {
					console.error('invalid nonce');
				}
			});

		// cancel server request on unmount
		return () => {
			request.cancel();
		};
	}, [
		collectionName,
		navigation,
		site.wcApiUrl,
		storeDB.collections,
		wpCredentials.jwt,
		wpCredentials.wpNonce,
	]);
};

export default useIdAudit;
