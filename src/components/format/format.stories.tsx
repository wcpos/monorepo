import React from 'react';
import { storiesOf } from '@storybook/react';

import * as Format from './';

storiesOf('Format', module)
	/**
	 *
	 */
	.add('name', () => <Format.Name firstName="Bob" lastName="Doe" />)

	/**
	 *
	 */
	.add('number', () => <Format.Number prefix="$">3.99</Format.Number>)

	/**
	 *
	 */
	.add('list', () => <Format.List array={['one', 'two', 'three']} />)

	/**
	 *
	 */
	.add('address', () => {
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
	});
