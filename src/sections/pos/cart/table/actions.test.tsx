import React from 'react';
import { render, fireEvent } from '../../../../test-utils';
import Actions from './actions';
import Button from '../../../../components/button';

const mockItem = {
	destroyPermanently: jest.fn(),
};

describe('Actions', () => {
	it('removes line_item', () => {
		// @ts-ignore
		const { getByType } = render(<Actions item={mockItem} />);
		const button = getByType(Button);
		fireEvent.press(button);
		expect(mockItem.destroyPermanently.call.length).toBe(1);
	});
});
