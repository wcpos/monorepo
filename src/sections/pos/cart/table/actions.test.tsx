import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import renderWithTheme from '../../../../../jest/render-with-theme';
import Actions from './actions';
// import Button from '../../../../components/button';

const mockItem = {
	destroyPermanently: jest.fn(),
};

describe('Actions', () => {
	it('removes line_item', () => {
		const { container } = renderWithTheme(<Actions item={mockItem} />);
		expect(container.firstChild).toBeInTheDocument();
		const button = screen.getByText('X');
		fireEvent.click(button);
		expect(mockItem.destroyPermanently.call.length).toBe(1);
	});
});
