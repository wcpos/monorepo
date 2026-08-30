/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { Actions } from './actions';

const mockRemoveLineItem = jest.fn();

jest.mock('../../hooks/use-remove-line-item', () => ({
	useRemoveLineItem: () => ({ removeLineItem: mockRemoveLineItem }),
}));

/**
 * A stand-in for IconButton that stays pressable even once `disabled` is set, so
 * the test exercises the cell's own guard rather than the DOM's — on native a
 * press can still land while React is re-rendering.
 */
jest.mock('@wcpos/components/icon-button', () => {
	const actualReact = jest.requireActual<typeof import('react')>('react');
	return {
		IconButton: ({ disabled, onPress }: { disabled?: boolean; onPress?: () => void }) =>
			actualReact.createElement('button', {
				type: 'button',
				'data-testid': 'remove-line-item',
				'data-disabled': String(!!disabled),
				onClick: onPress,
			}),
	};
});

function renderActions() {
	const pulseRemove = jest.fn();
	const rowRefs = {
		current: new Map([['uuid-1', { pulseAdd: jest.fn(), pulseRemove }]]),
	};

	const props = {
		row: { original: { uuid: 'uuid-1', type: 'line_items' } },
		table: { options: { meta: { rowRefs } } },
	} as unknown as React.ComponentProps<typeof Actions>;

	render(<Actions {...props} />);

	return { pulseRemove, button: screen.getByTestId('remove-line-item') };
}

beforeEach(() => {
	mockRemoveLineItem.mockClear();
});

describe('cart line Actions', () => {
	it('lets the first press win when the remove button is hammered (#1693)', () => {
		const { pulseRemove, button } = renderActions();

		// Three presses inside the 400ms pulse. Before the fix every press
		// restarted the pulse, cancelling the previous one and dropping its
		// pending removal, so the row sat tinted red and never went away.
		fireEvent.click(button);
		fireEvent.click(button);
		fireEvent.click(button);

		expect(pulseRemove).toHaveBeenCalledTimes(1);
		expect(button.getAttribute('data-disabled')).toBe('true');

		// The pulse completes and commits the removal exactly once — a second
		// removal would find no matching uuid and report a stale cart line.
		act(() => {
			(pulseRemove.mock.calls[0][0] as () => void)();
		});

		expect(mockRemoveLineItem).toHaveBeenCalledTimes(1);
		expect(mockRemoveLineItem).toHaveBeenCalledWith('uuid-1', 'line_items');
	});
});
