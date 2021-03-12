import * as React from 'react';
import Format from '../../../../../components/format';

type Props = {
	customer: any;
	type: 'shipping' | 'billing';
};

const Address = ({ customer, type }: Props) => {
	return <Format.Address address={customer[type]} showName={false} />;
};

export default Address;
