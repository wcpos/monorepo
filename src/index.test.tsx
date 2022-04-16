import * as React from 'react';
import { render } from '@testing-library/react';
import App from './index';

describe('App', () => {
	it('renders correctly', () => {
		const { container } = render(<App />);
		expect(container.firstChild).toBeInTheDocument();
	});
});
