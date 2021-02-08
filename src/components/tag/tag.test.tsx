import * as React from 'react';
import { render } from '@testing-library/react';
import Tag from './tag';

describe('Arrow', () => {
	it('renders correctly', () => {
		const { container } = render(<Tag>Test</Tag>);
		expect(container.firstChild).toBeInTheDocument();
	});
});
