import * as React from 'react';
import { View } from 'react-native';

import { formatAddress as formatLocalizedAddress } from 'localized-address-format';

import { Text } from '../text';

interface Address {
	address_1?: string;
	address_2?: string;
	city?: string;
	company?: string;
	country?: string;
	first_name?: string;
	last_name?: string;
	postcode?: string;
	state?: string;
}

export interface FormatAddressProps {
	address: Address;
	showName: boolean;
}

export function FormatAddress({ address, showName }: FormatAddressProps) {
	const country = address.country?.trim();
	const name = showName ? formatName(address, country) : '';
	const addressLines = [address.address_1, address.address_2].filter((line): line is string =>
		Boolean(line?.trim())
	);
	const localizedAddress = {
		postalCountry: country,
		administrativeArea: address.state,
		locality: address.city,
		postalCode: address.postcode,
		organization: address.company,
		name,
		addressLines,
	};
	const localizedLines = formatLocalizedAddress(localizedAddress);
	const defaultLines = country
		? formatLocalizedAddress({ ...localizedAddress, postalCountry: undefined })
		: [];
	const lines = hasUsableLocalizedFormat(country, localizedLines, defaultLines)
		? localizedLines
		: formatFallbackAddress(address, name);

	if (country) {
		lines.push(country);
	}

	return (
		<View>
			{lines.map((line, idx) => (
				<Text key={idx}>{line}</Text>
			))}
		</View>
	);
}

function formatName(address: Address, country?: string) {
	const givenName = address.first_name || '';
	const familyName = address.last_name || '';

	if (['CN', 'JP', 'TW'].includes(country || '')) {
		return `${familyName} ${givenName}`.trim();
	}

	return `${givenName} ${familyName}`.trim();
}

function formatFallbackAddress(address: Address, name: string) {
	return [
		name,
		address.company,
		address.address_1,
		address.address_2,
		address.city,
		address.state,
		address.postcode,
	].filter((line): line is string => Boolean(line?.trim()));
}

function hasUsableLocalizedFormat(
	country: string | undefined,
	lines: string[],
	defaultLines: string[]
) {
	return Boolean(country) && !linesEqual(lines, defaultLines);
}

function linesEqual(left: string[], right: string[]) {
	return left.length === right.length && left.every((line, idx) => line === right[idx]);
}
