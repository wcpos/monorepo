/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { Actions } from './actions';

const mockRemoveLineItem = jest.fn<Promise<void>, [string, string]>();

jest.mock('../../hooks/use-remove-line-item', () => ({
	useRemoveLineItem: () => ({ removeLineItem: mockRemoveLineItem }),
}));

/**
 * A stand-in for IconButton that is always pressable. The cell must guard itself
 * rather than lean on the `disabled` prop: on Android, removing `disabled` once
 * it has been set does not reliably re-enable the native view.
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

/** The pulse callback the cell handed to `pulseRemove` for press number `n`. */
function committedRemoval(pulseRemove: jest.Mock, n = 0) {
	return pulseRemove.mock.calls[n][0] as () => void | Promise<unknown>;
}

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
	mockRemoveLineItem.mockReset();
	mockRemoveLineItem.mockResolvedValue(undefined);
});

describe('cart line Actions', () => {
	it('lets the first press win when the remove button is hammered (#1693)', async () => {
		const { pulseRemove, button } = renderActions();

		// Three presses inside the 400ms pulse. Before the fix every press
		// restarted the pulse, cancelling the previous one and dropping its
		// pending removal, so the row sat tinted red and never went away.
		fireEvent.click(button);
		fireEvent.click(button);
		fireEvent.click(button);

		expect(pulseRemove).toHaveBeenCalledTimes(1);

		// The pulse completes and commits the removal exactly once — a second
		// removal would find no matching uuid and report a stale cart line.
		await act(async () => {
			await committedRemoval(pulseRemove)();
		});

		expect(mockRemoveLineItem).toHaveBeenCalledTimes(1);
		expect(mockRemoveLineItem).toHaveBeenCalledWith('uuid-1', 'line_items');
	});

	it('never toggles the button `disabled` prop, which latches on Android', () => {
		const { button } = renderActions();

		fireEvent.click(button);

		expect(button.getAttribute('data-disabled')).toBe('false');
	});

	it('stays pressable when the removal fails, so the cashier can try again', async () => {
		mockRemoveLineItem.mockRejectedValue(new Error('local write failed'));
		const { pulseRemove, button } = renderActions();

		fireEvent.click(button);
		await act(async () => {
			await committedRemoval(pulseRemove)();
		});
		expect(mockRemoveLineItem).toHaveBeenCalledTimes(1);

		// The line is still in the cart: a later press must start a new pulse
		// rather than finding the row permanently latched.
		mockRemoveLineItem.mockResolvedValue(undefined);
		fireEvent.click(button);

		expect(pulseRemove).toHaveBeenCalledTimes(2);

		await act(async () => {
			await committedRemoval(pulseRemove, 1)();
		});

		expect(mockRemoveLineItem).toHaveBeenCalledTimes(2);
	});
});
