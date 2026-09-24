import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { mockPhone, mockPlatform, mockRoot } from '../dropdown-menu/sheet.test-utils';
jest.mock('@rn-primitives/select', () =>
	jest.requireActual('../dropdown-menu/sheet.test-utils').mockPrimitive(true)
);
mockPlatform.OS = 'ios';
mockPhone.current = true;
const C: typeof import('./index') = jest.requireActual('./index');
it('mounts a native phone sheet and closes through the root on row press', () => {
	render(
		<C.SelectContent inline testID="panel">
			<C.SelectItem testID="row" value="a" label="A">
				A
			</C.SelectItem>
		</C.SelectContent>
	);
	expect(screen.getByRole('dialog')).toHaveClass('rounded-t-2xl');
	expect(document.querySelector('[data-primitive]')).toBeNull();
	fireEvent.click(screen.getByTestId('row'));
	expect(mockRoot.onOpenChange).toHaveBeenCalledWith(false);
});
