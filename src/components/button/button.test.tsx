import * as React from 'react';
// import { render } from '@testing-library/react';
import Button from '.';
import renderWithTheme from '../../../jest/render-with-theme';

describe('Button', () => {
	it('renders correctly', () => {
		const { container } = renderWithTheme(<Button />);
		expect(container.firstChild).toBeInTheDocument();
	});
});
