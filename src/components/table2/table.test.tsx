import React from 'react';
import { render } from '@testing-library/react';
import Table from './';

describe('Arrow', () => {
	it('renders correctly', () => {
		const { container } = render(<Table />);
		expect(container.firstChild).toBeInTheDocument();
	});
});
