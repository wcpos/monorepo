import http from '../../lib/http';
import { useEffect, useState } from 'react';
import hash from 'hash-sum';
import useDatabase from '../use-database';

const { CancelToken } = http;

function useAPI(url, config = {}, initialFetch = true) {
	const [state, setState] = useState({
		response: undefined,
		error: undefined,
		isLoading: true,
	});

	const configHash = hash(config);

	const source = CancelToken.source();

	function fetch() {
		http('https://wcposdev.wpengine.com/wp-json/wc/v3/' + url, {
			auth: {
				username: 'ck_0a250a3037617df63551e58e154f82a1e04a04aa',
				password: 'cs_285369544840cbe03b6c483ad7bf0e455a8935a3',
			},
			cancelToken: source.token,
		})
			.then(response => {
				setState({ error: undefined, response, isLoading: false });
			})
			.catch(error => {
				if (http.isCancel(error)) {
					console.log('Request canceled by cleanup: ', error.message);
				} else {
					setState({ error, response: undefined, isLoading: false });
				}
			});
	}

	useEffect(() => {
		setState({ ...state, isLoading: true });

		if (initialFetch) {
			fetch();
		}

		return () => {
			source.cancel('useEffect cleanup.');
		};

		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [url, configHash]);

	const { response, error, isLoading } = state;

	function setData(newData) {
		// Used to update state from component
		const newResponse = { ...response, data: newData };
		setState({ ...state, response: newResponse });
	}

	const data = response ? response.data : undefined;
	return { data, response, error, isLoading, setData, fetch };
}

export default useAPI;
