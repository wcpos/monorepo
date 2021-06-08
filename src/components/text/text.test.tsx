import * as React from 'react';
import renderWithTheme from '@wcpos/common/jest/render-with-theme';
import Text from '.';

describe('Text', () => {
	it('renders correctly', () => {
		const test = 'Hello World';
		const { container } = renderWithTheme(<Text>{test}</Text>);
		expect(container.firstChild).toBeInTheDocument();
		expect(container.firstChild).toHaveTextContent(test);
	});
});
