import * as React from 'react';
import { View } from 'react-native';
import { render } from '@testing-library/react';
import Draggable from './draggable';

describe('Arrow', () => {
	it('renders correctly', () => {
		const { container } = render(
			<Draggable>
				<View />
			</Draggable>
		);
		expect(container.firstChild).toBeInTheDocument();
	});
});
