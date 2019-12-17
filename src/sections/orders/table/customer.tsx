import React from 'react';
import Text from '../../../components/text';
import useFetch from '../../../hooks/use-fetch';

const Customer = ({ customerQuery }: any) => {
	const [{ data, error, loading }] = useFetch(customerQuery);

	if (loading || !data) {
		return <Text>Loading</Text>;
	}
	const customer = data[0];

	return <Text>{customer?.name}</Text>;
};

export default Customer;
