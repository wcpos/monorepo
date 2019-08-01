import React, { Fragment } from 'react';
import Text from '../../../components/text';

type Props = {
	address:
	| import('../../../store/models/types').BillingProps
	| import('../../../store/models/types').ShippingProps;
};

const Address = ({ address }: Props) => {
	return (
		<Fragment>
			<Text>
				{address.first_name} {address.last_name}
			</Text>
			<Text>{address.company}</Text>
			<Text>{address.address_1}</Text>
			<Text>{address.address_2}</Text>
			<Text>
				{address.city}, {address.state} {address.postcode}
			</Text>
		</Fragment>
	);
};

export default Address;
