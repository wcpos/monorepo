import * as React from 'react';

import Format, {
	FormatAddressProps,
	FormatListProps,
	FormatNameProps,
	FormatNumberProps,
	FormatDateProps,
} from '.';

export default {
	title: 'Components/Format',
	component: Format,
	subcomponents: [Format.Name, Format.Number, Format.List, Format.Address, Format.Date],
};

export const _Name = (props: FormatNameProps) => <Format.Name {...props} />;
_Name.args = {
	firstName: 'Bob',
	lastName: 'Doe',
};

export const _Number = (props: FormatNumberProps) => <Format.Number {...props}>3.99</Format.Number>;
_Number.args = {
	prefix: '$',
};

export const _List = (props: FormatListProps) => <Format.List {...props} />;
_List.args = {
	array: ['one', 'two', 'three'],
};

export const _Address = (props: FormatAddressProps) => <Format.Address {...props} />;
_Address.args = {
	address: {
		first_name: 'John',
		last_name: 'Doe',
		company: 'ACME Inc.',
		address_1: '969 Market',
		address_2: 'Suite 66',
		city: 'San Francisco',
		state: 'CA',
		postcode: '94103',
		country: 'US',
	},
};

export const _Date = (props: FormatDateProps) => <Format.Date {...props} />;
_Date.args = {
	value: '2017-03-23T20:01:14',
};
