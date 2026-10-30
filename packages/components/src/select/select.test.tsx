import * as React from 'react';

import { fireEvent, render, screen, within } from '@testing-library/react';

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
	const pressed = jest.fn();
	render(
		<C.SelectContent inline testID="panel">
			<C.SelectGroup>
				<C.SelectLabel testID="label">Sizes</C.SelectLabel>
				<C.SelectSeparator testID="separator" />
				<C.SelectItem testID="a" value="a" label="A" />
				<C.SelectItem testID="b" value="b" label="B" />
				<C.SelectItem testID="disabled" value="c" label="C" disabled />
				<C.SelectItem testID="stay" value="d" label="D" closeOnPress={false} onPress={pressed} />
			</C.SelectGroup>
		</C.SelectContent>
	);
	expect(screen.getAllByRole('dialog')).toHaveLength(1);
	// The rows sit in a group (the sheet's container and the SelectGroup); the label reads at the floor.
	expect(screen.getAllByRole('group')).toHaveLength(2);
	expect(screen.queryByRole('listbox')).toBeNull();
	expect(screen.getByTestId('label').querySelector('[data-variant="caption"]')).not.toBeNull();
	// A caller's press handler runs, and closeOnPress={false} keeps the sheet open.
	fireEvent.click(screen.getByTestId('stay'));
	expect(pressed).toHaveBeenCalledTimes(1);
	expect(mockRoot.onValueChange).toHaveBeenCalledWith({ value: 'd', label: 'D' });
	expect(mockRoot.onOpenChange).not.toHaveBeenCalled();
	mockRoot.onValueChange.mockClear();
	expect(document.querySelector('[data-primitive]')).toBeNull();
	expect(screen.getByTestId('b')).toHaveAttribute('aria-selected', 'true');
	expect(screen.getByTestId('b').querySelector('[data-icon="check"]')).not.toBeNull();
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
it('hosts the anchored web row in the Radix option, which keeps the data-testid and the press', () => {
	mockPhone.current = false;
	render(
		<C.SelectContent inline>
			<C.SelectItem testID="anchored" value="b" label="B" />
		</C.SelectContent>
	);
	expect(screen.getByTestId('primitive-content')).toBeInTheDocument();
	const option = screen.getByTestId('anchored');
	expect(option).toHaveClass('rounded-md web:focus:bg-accent');
	// The row inside draws (inset, check) but is no second control: its click would be swallowed.
	const row = option.querySelector('.px-2\\.5');
	expect(row).not.toBeNull();
	expect(row).not.toHaveAttribute('role');
	expect(row?.querySelector('[data-icon="check"]')).not.toBeNull();
});
it('the phone sheet sits inside the scrim, not beside it', () => {
	// The primitive's web Overlay renders its Pressable childless and emits the children as
	// SIBLINGS; the harness mock keeps them inside. Replay the real shape here: a sheet that
	// leaned on the primitive's Overlay would land outside the scrim's justify-end box —
	// below the app root, off-screen on a phone.
	const primitive = jest.requireMock('@rn-primitives/select');
	const Keep = primitive.Overlay;
	function SiblingOverlay({ children, ...p }: React.ComponentProps<typeof Keep>) {
		return (
			<>
				<Keep {...p} data-testid="primitive-overlay" />
				{children}
			</>
		);
	}
	primitive.Overlay = SiblingOverlay;
	try {
		render(
			<C.SelectContent inline testID="panel">
				<C.SelectItem testID="a" value="a" label="A" />
			</C.SelectContent>
		);
		expect(within(screen.getByTestId('panel-scrim')).getByRole('dialog')).toBeTruthy();
		expect(screen.queryByTestId('primitive-overlay')).toBeNull();
	} finally {
		primitive.Overlay = Keep;
	}
});
it('renders nothing for a closed inline sheet', () => {
	mockRoot.open = false;
	const { container } = render(<C.SelectContent inline />);
	expect(container).toBeEmptyDOMElement();
});
it('gives an OptionSelect trigger and each option a stable testID', () => {
	render(
		<C.OptionSelect
			triggerTestID="class-select"
			placeholder="Class"
			value="standard"
			options={[
				{ value: 'standard', label: 'Standard' },
				{ value: 'reduced-rate', label: 'Reduced rate' },
			]}
		/>
	);
	expect(screen.getByTestId('class-select')).toBeTruthy();
	expect(screen.getByTestId('class-select-option-standard')).toBeTruthy();
	expect(screen.getByTestId('class-select-option-reduced-rate')).toBeTruthy();
});
