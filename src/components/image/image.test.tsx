import * as React from 'react';
import renderWithTheme from '@wcpos/common/jest/render-with-theme';
import Image from '.';

describe('Text', () => {
	const src = 'https://i.imgur.com/0y8Ftya.jpg'; // large image 3.6MB

	it('renders correctly', () => {
		const { container } = renderWithTheme(<Image src={src} />);
		expect(container.firstChild).toBeInTheDocument();
	});
});
