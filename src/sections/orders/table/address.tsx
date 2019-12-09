import React from 'react';
import Text from '../../../components/text';
import { Address as FormatAddress } from '../../../components/format';
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

	return <FormatAddress address={data.toJSON()} />;
};

export default Address;
