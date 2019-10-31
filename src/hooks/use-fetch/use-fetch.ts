import { useState, useEffect } from 'react';
import useDatabase from '../use-database';

const useFetch = () => {
	const [data, setData] = useState([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(false);
	const { storeDB } = useDatabase();

	useEffect(() => {
		const fetchData = async () => {
			setError(false);
			setLoading(true);
			try {
				const productsCollection = storeDB.collections.get('products');
				const result = await productsCollection.query().fetch();
				setData(result.slice(0, 1));
			} catch (error) {
				setError(true);
			}
			setLoading(false);
		};
		fetchData();
	}, [storeDB.collections]);

	return [{ data, loading, error }];
};

export default useFetch;
