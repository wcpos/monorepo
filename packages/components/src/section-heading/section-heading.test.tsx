import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { SectionHeading } from './index';

describe('SectionHeading', () => {
	it('renders a level-2 heading with the title and the description', () => {
		render(<SectionHeading title="Store" description="Where the till sells from" />);

		expect(screen.getByRole('heading', { level: 2, name: 'Store' })).toBeTruthy();
		expect(screen.getByText('Where the till sells from')).toBeTruthy();
	});

	it('renders the title alone without a description', () => {
		render(<SectionHeading title="Store" testID="heading" />);

		expect(screen.getByTestId('heading').textContent).toBe('Store');
	});
});
