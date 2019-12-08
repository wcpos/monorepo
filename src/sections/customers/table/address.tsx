import React, { Fragment } from 'react';
import Text from '../../../components/text';
import useFetch from '../../../hooks/use-fetch';

// type Props = {
// 	address:
// 		| import('../../../store/models/types').BillingProps
// 		| import('../../../store/models/types').ShippingProps;
// };

const Address = ({ address }: any) => {
	const [{ data, error, loading }] = useFetch(address);

	if (loading || !data) {
		return <Text>Loading</Text>;
	}

	return (
		<Fragment>
			<Text>{data.address_1}</Text>
			<Text>{data.address_2}</Text>
			<Text>
				{data.city}, {data.state} {data.postcode}
			</Text>
		</Fragment>
	);
};

export default Address;
