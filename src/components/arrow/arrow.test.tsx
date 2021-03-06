import * as React from 'react';
import { render } from '@testing-library/react';
import { Arrow } from './arrow';

describe('Arrow', () => {
	it('renders correctly', () => {
		const { container } = render(<Arrow />);
		expect(container.firstChild).toBeInTheDocument();
	});
});
