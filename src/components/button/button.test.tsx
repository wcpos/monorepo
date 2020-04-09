import React from 'react';
import { render } from '@testing-library/react';
import Button from './';

describe('Button', () => {
	it('renders correctly', () => {
		const { container } = render(<Button />);
		expect(container.firstChild).toBeInTheDocument();
	});
});
