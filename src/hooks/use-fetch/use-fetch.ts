import { useState, useEffect } from 'react';
type Query = import('@nozbe/watermelondb').Query<Model>;

const useFetch = (query: Query) => {
	const [data, setData] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);

	useEffect(() => {
		const fetchData = async () => {
			setError(false);
			setLoading(true);
			try {
				const result = await query.fetch();
				setData(result);
			} catch (error) {
				setError(true);
			}
			setLoading(false);
		};
		fetchData();
	}, [query]);

	return [{ data, loading, error }];
};

export default useFetch;
