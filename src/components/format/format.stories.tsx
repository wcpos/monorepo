import * as React from 'react';

import Format from '.';

export default {
	title: 'Components/Format',
};

export const name = () => <Format.Name firstName="Bob" lastName="Doe" />;

export const number = () => <Format.Number prefix="$">3.99</Format.Number>;

export const list = () => <Format.List array={['one', 'two', 'three']} />;

export const address_1 = () => {
	const address = {
		first_name: 'John',
		last_name: 'Doe',
		company: 'ACME Inc.',
		address_1: '969 Market',
		address_2: 'Suite 66',
		city: 'San Francisco',
		state: 'CA',
		postcode: '94103',
		country: 'US',
	};
	return <Format.Address address={address} />;
};
