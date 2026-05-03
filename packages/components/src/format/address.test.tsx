import '@testing-library/jest-dom';
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { FormatAddress } from './address';

jest.mock('react-native', () => ({
	View: (props: any) => React.createElement('div', props),
}));

jest.mock('../text', () => ({
	Text: ({ children }: any) => React.createElement('div', null, children),
}));

describe('FormatAddress', () => {
	it('formats a US address using localized postal ordering', () => {
		render(
			<FormatAddress
				showName
				address={{
					first_name: 'Jon',
					last_name: 'Doe',
					company: 'Example Org.',
					address_1: '548 Market St',
					address_2: 'Suite 100',
					city: 'San Francisco',
					state: 'CA',
					postcode: '94016',
					country: 'US',
				}}
			/>
		);

		expect(screen.getByText('Jon Doe')).toBeInTheDocument();
		expect(screen.getByText('Example Org.')).toBeInTheDocument();
		expect(screen.getByText('548 Market St')).toBeInTheDocument();
		expect(screen.getByText('Suite 100')).toBeInTheDocument();
		expect(screen.getByText('San Francisco, CA 94016')).toBeInTheDocument();
		expect(screen.getByText('US')).toBeInTheDocument();
	});

	it('formats a Japanese address in local big-to-small order', () => {
		render(
			<FormatAddress
				showName
				address={{
					first_name: '太郎',
					last_name: '山田',
					company: '株式会社例',
					address_1: '渋谷1-2-3',
					address_2: '4F',
					city: '渋谷区',
					state: '東京都',
					postcode: '150-0002',
					country: 'JP',
				}}
			/>
		);

		expect(screen.getByText('〒150-0002')).toBeInTheDocument();
		expect(screen.getByText('東京都')).toBeInTheDocument();
		expect(screen.getByText('渋谷1-2-3')).toBeInTheDocument();
		expect(screen.getByText('4F')).toBeInTheDocument();
		expect(screen.getByText('株式会社例')).toBeInTheDocument();
		expect(screen.getByText('山田 太郎')).toBeInTheDocument();
		expect(screen.getByText('JP')).toBeInTheDocument();
	});

	it('omits the name when showName is false and drops empty lines', () => {
		render(
			<FormatAddress
				showName={false}
				address={{
					first_name: 'Jon',
					last_name: 'Doe',
					address_1: 'Dam 1',
					city: 'Amsterdam',
					postcode: '1012 JS',
					country: 'NL',
				}}
			/>
		);

		expect(screen.queryByText('Jon Doe')).not.toBeInTheDocument();
		expect(screen.getByText('Dam 1')).toBeInTheDocument();
		expect(screen.getByText('1012 JS Amsterdam')).toBeInTheDocument();
		expect(screen.getByText('NL')).toBeInTheDocument();
	});

	it('uses known localized formats when they intentionally omit administrative area', () => {
		render(
			<FormatAddress
				showName
				address={{
					first_name: 'Jane',
					last_name: 'Doe',
					company: 'Example Org.',
					address_1: '10 Downing St',
					city: 'London',
					state: 'England',
					postcode: 'SW1A 1AA',
					country: 'GB',
				}}
			/>
		);

		expect(screen.getByText('Jane Doe')).toBeInTheDocument();
		expect(screen.getByText('Example Org.')).toBeInTheDocument();
		expect(screen.getByText('10 Downing St')).toBeInTheDocument();
		expect(screen.getByText('London')).toBeInTheDocument();
		expect(screen.getByText('SW1A 1AA')).toBeInTheDocument();
		expect(screen.queryByText('England')).not.toBeInTheDocument();
		expect(screen.getByText('GB')).toBeInTheDocument();
	});

	it('preserves city, state, and postcode when no country format is available', () => {
		render(
			<FormatAddress
				showName={false}
				address={{
					address_1: '123 Unknown Rd',
					city: 'Springfield',
					state: 'IL',
					postcode: '62704',
					country: 'XX',
				}}
			/>
		);

		expect(screen.getByText('123 Unknown Rd')).toBeInTheDocument();
		expect(screen.getByText('Springfield')).toBeInTheDocument();
		expect(screen.getByText('IL')).toBeInTheDocument();
		expect(screen.getByText('62704')).toBeInTheDocument();
		expect(screen.getByText('XX')).toBeInTheDocument();
	});
});
