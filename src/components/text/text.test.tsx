import * as React from 'react';
import Text from '.';
import renderWithTheme from '../../../jest/render-with-theme';

describe('Text', () => {
	it('renders correctly', () => {
		const test = 'Hello World';
		const { container } = renderWithTheme(<Text>{test}</Text>);
		expect(container.firstChild).toBeInTheDocument();
		expect(container.firstChild).toHaveTextContent(test);
	});
});
