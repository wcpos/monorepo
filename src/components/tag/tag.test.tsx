import * as React from 'react';
import renderWithTheme from '../../../jest/render-with-theme';
import { Tag } from './tag';

describe('Tag', () => {
	it('renders correctly', () => {
		const { container } = renderWithTheme(<Tag>Test</Tag>);
		expect(container.firstChild).toBeInTheDocument();
		expect(container.firstChild?.textContent).toEqual('Test');
	});
});
