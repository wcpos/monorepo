import React from 'react';
import { View } from 'react-native';
import Text from '../text';

interface Props {
	address: {
		address_1?: string;
		address_2?: string;
		city?: string;
		company?: string;
		country?: string;
		first_name?: string;
		last_name?: string;
		postcode?: string;
		state?: string;
	};
	showName: boolean;
}

const addresses = {
	default: '{name}\n{company}\n{address_1}\n{address_2}\n{city}\n{state}\n{postcode}\n{country}',
	AU: '{name}\n{company}\n{address_1}\n{address_2}\n{city} {state} {postcode}\n{country}',
	AT: '{company}\n{name}\n{address_1}\n{address_2}\n{postcode} {city}\n{country}',
	BE: '{company}\n{name}\n{address_1}\n{address_2}\n{postcode} {city}\n{country}',
	CA:
		'{company}\n{name}\n{address_1}\n{address_2}\n{city} {state_code}&nbsp;&nbsp;{postcode}\n{country}',
	CH: '{company}\n{name}\n{address_1}\n{address_2}\n{postcode} {city}\n{country}',
	CL: '{company}\n{name}\n{address_1}\n{address_2}\n{state}\n{postcode} {city}\n{country}',
	CN: '{country} {postcode}\n{state}, {city}, {address_2}, {address_1}\n{company}\n{name}',
	CZ: '{company}\n{name}\n{address_1}\n{address_2}\n{postcode} {city}\n{country}',
	DE: '{company}\n{name}\n{address_1}\n{address_2}\n{postcode} {city}\n{country}',
	EE: '{company}\n{name}\n{address_1}\n{address_2}\n{postcode} {city}\n{country}',
	FI: '{company}\n{name}\n{address_1}\n{address_2}\n{postcode} {city}\n{country}',
	DK: '{company}\n{name}\n{address_1}\n{address_2}\n{postcode} {city}\n{country}',
	FR: '{company}\n{name}\n{address_1}\n{address_2}\n{postcode} {city_upper}\n{country}',
	HK:
		'{company}\n{first_name} {last_name_upper}\n{address_1}\n{address_2}\n{city_upper}\n{state_upper}\n{country}',
	HU: '{name}\n{company}\n{city}\n{address_1}\n{address_2}\n{postcode}\n{country}',
	IN: '{company}\n{name}\n{address_1}\n{address_2}\n{city} {postcode}\n{state}, {country}',
	IS: '{company}\n{name}\n{address_1}\n{address_2}\n{postcode} {city}\n{country}',
	IT: '{company}\n{name}\n{address_1}\n{address_2}\n{postcode}\n{city}\n{state_upper}\n{country}',
	JP:
		'{postcode}\n{state} {city} {address_1}\n{address_2}\n{company}\n{last_name} {first_name}\n{country}',
	TW:
		'{company}\n{last_name} {first_name}\n{address_1}\n{address_2}\n{state}, {city} {postcode}\n{country}',
	LI: '{company}\n{name}\n{address_1}\n{address_2}\n{postcode} {city}\n{country}',
	NL: '{company}\n{name}\n{address_1}\n{address_2}\n{postcode} {city}\n{country}',
	NZ: '{name}\n{company}\n{address_1}\n{address_2}\n{city} {postcode}\n{country}',
	NO: '{company}\n{name}\n{address_1}\n{address_2}\n{postcode} {city}\n{country}',
	PL: '{company}\n{name}\n{address_1}\n{address_2}\n{postcode} {city}\n{country}',
	PT: '{company}\n{name}\n{address_1}\n{address_2}\n{postcode} {city}\n{country}',
	SK: '{company}\n{name}\n{address_1}\n{address_2}\n{postcode} {city}\n{country}',
	RS: '{name}\n{company}\n{address_1}\n{address_2}\n{postcode} {city}\n{country}',
	SI: '{company}\n{name}\n{address_1}\n{address_2}\n{postcode} {city}\n{country}',
	ES: '{name}\n{company}\n{address_1}\n{address_2}\n{postcode} {city}\n{state}\n{country}',
	SE: '{company}\n{name}\n{address_1}\n{address_2}\n{postcode} {city}\n{country}',
	TR: '{name}\n{company}\n{address_1}\n{address_2}\n{postcode} {city} {state}\n{country}',
	UG: '{name}\n{company}\n{address_1}\n{address_2}\n{city}\n{state}, {country}',
	US: '{name}\n{company}\n{address_1}\n{address_2}\n{city}, {state_code} {postcode}\n{country}',
	VN: '{name}\n{company}\n{address_1}\n{city}\n{country}',
};

const Address = ({ address, showName }: Props) => {
	const addr = { ...address }; // clone address
	let template = addresses[addr.country] || addresses.default;
	if (showName !== false) {
		addr.name = `${addr.first_name} ${addr.last_name}`;
	}
	addr.state_code = addr.state;
	addr.state_upper = addr.state?.toUpperCase();
	addr.city_upper = addr.city?.toUpperCase();

	const matches = template.match(/\{[\w]+\}/g);
	matches &&
		matches.forEach((match) => {
			const regex = new RegExp(match, 'g');
			const prop = match.split(/{|}/g)[1];
			template = template.replace(regex, addr[prop] || '');
		});

	return (
		<View>
			{template.split('\n').map((line, idx) => {
				if (line.trim()) {
					return <Text key={idx}>{line}</Text>;
				}
			})}
		</View>
	);
};

export default Address;
