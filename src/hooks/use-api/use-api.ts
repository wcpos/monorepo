import axios from 'axios';
import { useEffect, useState } from 'react';
import hash from 'hash-sum';

const { CancelToken } = axios;

function useAPI(url, config = {}, initialFetch = true) {
	const [state, setState] = useState({
		response: undefined,
		error: undefined,
		isLoading: true,
	});

	const configHash = hash(config);

	const source = CancelToken.source();

	function fetch() {
		axios(url, {
			...config,
			cancelToken: source.token,
		})
			.then(response => {
				setState({ error: undefined, response, isLoading: false });
			})
			.catch(error => {
				if (axios.isCancel(error)) {
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
	}, [url, configHash, state, initialFetch, fetch, source]);

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
