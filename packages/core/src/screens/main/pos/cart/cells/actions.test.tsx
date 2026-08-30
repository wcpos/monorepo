/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { Actions } from './actions';

const mockRemoveLineItem = jest.fn<Promise<void>, [string, string]>();
const mockLogger = (getLogger as unknown as jest.Mock)(['test']) as { error: jest.Mock };

jest.mock('../../hooks/use-remove-line-item', () => ({
	useRemoveLineItem: () => ({ removeLineItem: mockRemoveLineItem }),
}));

/**
 * A stand-in for IconButton that is always pressable. The cell must never lean
 * on the `disabled` prop: on Android, removing `disabled` once it has been set
 * does not reliably re-enable the native view.
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
	mockLogger.error.mockClear();
});

describe('cart line Actions', () => {
	/**
	 * The cell holds no latch of its own: `pulseRemove` owns the re-entrancy
	 * guard, because it is the only side that can see the pulse being cancelled
	 * (a quantity change on this line makes the cart table fire `pulseAdd()` for
	 * the same uuid). A latch here could never be released on that path.
	 */
	it('forwards every press to pulseRemove rather than latching', () => {
		const { pulseRemove, button } = renderActions();

		fireEvent.click(button);
		fireEvent.click(button);
		fireEvent.click(button);

		expect(pulseRemove).toHaveBeenCalledTimes(3);
	});

	it('commits the removal once when the pulse completes (#1693)', async () => {
		const { pulseRemove, button } = renderActions();

		fireEvent.click(button);

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

	it('stays pressable after a removal that left the row mounted', async () => {
		// `localPatch` logs and toasts the failures it handles and then RESOLVES,
		// so a removal that never landed is indistinguishable from one that did. If
		// the row is still on screen it has to stay removable.
		const { pulseRemove, button } = renderActions();

		fireEvent.click(button);
		await act(async () => {
			await committedRemoval(pulseRemove)();
		});

		fireEvent.click(button);
		await act(async () => {
			await committedRemoval(pulseRemove, 1)();
		});

		expect(mockRemoveLineItem).toHaveBeenCalledTimes(2);
	});

	it('logs an unexpected rejection without toasting it a second time', async () => {
		mockRemoveLineItem.mockRejectedValue(new Error('local write failed'));
		const { pulseRemove, button } = renderActions();

		fireEvent.click(button);
		await act(async () => {
			await committedRemoval(pulseRemove)();
		});

		expect(mockLogger.error).toHaveBeenCalledTimes(1);
		const [message, options] = mockLogger.error.mock.calls[0] as [
			string,
			{ code: string; showToast?: boolean; context: Record<string, unknown> },
		];
		expect(message).toBe('Cart line removal failed');
		expect(options.code).toBe(ERROR_CODES.CART_UPDATE_FAILED);
		// localPatch already toasted whatever it handled — no second toast here.
		expect(options.showToast).toBeUndefined();
		expect(options.context).toMatchObject({ uuid: 'uuid-1', itemType: 'line_items' });
	});
});
