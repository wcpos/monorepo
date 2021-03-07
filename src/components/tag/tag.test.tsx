import * as React from 'react';
import { render } from '@testing-library/react';
import { ThemeProvider } from '@wcpos/common/src/hooks/use-theme';
import { Tag } from './tag';

describe('Tag', () => {
	it('renders correctly', () => {
		const { container } = render(
			<ThemeProvider>
				<Tag>Test</Tag>
			</ThemeProvider>
		);
		expect(container.firstChild).toBeInTheDocument();
	});
});
