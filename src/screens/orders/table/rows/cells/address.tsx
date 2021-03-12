import * as React from 'react';
import Format from '../../../../../components/format';

type Props = {
	order: any;
	type: 'shipping' | 'billing';
};

const Address = ({ order, type }: Props) => {
	return <Format.Address address={order[type]} showName={false} />;
};

export default Address;
