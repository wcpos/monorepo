import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { mockPhone, mockRoot } from '../dropdown-menu/sheet.test-utils';
import * as C from './index';
jest.mock('@rn-primitives/select', () =>
	jest.requireActual('../dropdown-menu/sheet.test-utils').mockPrimitive(true)
);
beforeEach(() => {
	mockPhone.current = true;
	mockRoot.open = true;
	jest.clearAllMocks();
});
// Wrong payloads, missing selection marks, and accidental Radix sheet children must fail.
it('emits an option before closing and marks only the selected row', () => {
	render(
		<C.SelectContent inline testID="panel">
			<C.SelectGroup>
				<C.SelectLabel testID="label">Sizes</C.SelectLabel>
				<C.SelectSeparator testID="separator" />
				<C.SelectItem testID="a" value="a" label="A" />
				<C.SelectItem testID="b" value="b" label="B" />
				<C.SelectItem testID="disabled" value="c" label="C" disabled />
			</C.SelectGroup>
		</C.SelectContent>
	);
	expect(screen.getAllByRole('dialog')).toHaveLength(1);
	expect(screen.getByRole('group')).toBeInTheDocument();
	expect(document.querySelector('[data-primitive]')).toBeNull();
	expect(screen.getByTestId('b')).toHaveAttribute('aria-selected', 'true');
	expect(screen.getByTestId('b').querySelector('[data-icon="check"]')).toHaveClass('ml-auto');
	expect(screen.getByTestId('a')).toHaveAttribute('aria-selected', 'false');
	expect(screen.getByTestId('a').querySelector('[data-icon="check"]')).toBeNull();
	expect(screen.getByTestId('disabled')).toHaveClass('opacity-45');
	fireEvent.click(screen.getByTestId('disabled'));
	expect(mockRoot.onValueChange).not.toHaveBeenCalled();
	fireEvent.click(screen.getByTestId('a'));
	expect(mockRoot.onValueChange).toHaveBeenCalledWith({ value: 'a', label: 'A' });
	expect(mockRoot.onOpenChange).toHaveBeenCalledWith(false);
	expect(mockRoot.onValueChange.mock.invocationCallOrder[0]).toBeLessThan(
		mockRoot.onOpenChange.mock.invocationCallOrder[0]
	);
});
it('renders no scroll buttons in a sheet', () => {
	render(
		<C.SelectContent inline>
			<C.SelectScrollUpButton data-testid="up" />
			<C.SelectScrollDownButton data-testid="down" />
		</C.SelectContent>
	);
	expect(screen.queryByTestId('up')).toBeNull();
	expect(screen.queryByTestId('down')).toBeNull();
});
it('keeps the anchored item data-testid mapping', () => {
	mockPhone.current = false;
	render(
		<C.SelectContent inline>
			<C.SelectItem testID="anchored" value="a" label="A" />
		</C.SelectContent>
	);
	expect(screen.getByTestId('primitive-content')).toBeInTheDocument();
	expect(screen.getByTestId('anchored')).toHaveClass('pl-8');
});
it('renders nothing for a closed inline sheet', () => {
	mockRoot.open = false;
	const { container } = render(<C.SelectContent inline />);
	expect(container).toBeEmptyDOMElement();
});
