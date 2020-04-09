import React from 'react';
import { render } from '@testing-library/react';
import Text from './';

describe('Text', () => {
	it('renders correctly', () => {
		const { container } = render(<Text>Hello World</Text>);
		expect(container.firstChild).toBeInTheDocument();
	});
});
