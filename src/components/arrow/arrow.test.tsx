import * as React from 'react';
import renderWithTheme from '../../../jest/render-with-theme';
import { Arrow } from './arrow';

describe('Arrow', () => {
	it('renders correctly', () => {
		const { container } = renderWithTheme(<Arrow />);
		expect(container.firstChild).toBeInTheDocument();
	});
});
