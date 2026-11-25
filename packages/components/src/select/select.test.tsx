import * as React from 'react';

import { act, fireEvent, render, screen, within } from '@testing-library/react';

import { mockPhone, mockPlatform, mockRoot } from '../dropdown-menu/sheet.test-utils';
import * as C from './index';
jest.mock('@rn-primitives/select', () =>
	jest.requireActual('../dropdown-menu/sheet.test-utils').mockPrimitive(true)
);
const mockMultiContent = jest.fn();
const mockMultiLayout: { current: (e: unknown) => void } = { current: () => {} };
jest.mock('./select-multi', () => ({
	SelectMultiRoot: ({ children }: { children: React.ReactNode }) => children,
	SelectMultiTrigger: ({ onLayout }: { onLayout: (e: unknown) => void }) => {
		mockMultiLayout.current = onLayout;
		return null;
	},
	SelectMultiContent: (props: { style?: unknown }) => {
		mockMultiContent(props.style);
		return null;
	},
}));
const mockFieldBox = jest.fn();
jest.mock('../field-box', () => {
	const actual = jest.requireActual('../field-box');
	return {
		...actual,
		fieldBox: (props: { state?: string }) => {
			mockFieldBox(props?.state);
			return actual.fieldBox(props);
		},
	};
});
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

it.each([
	[false, false, 'attention'],
	[true, false, 'open'],
	[false, true, 'disabled'],
] as const)(
	"a tone='attention' trigger (open %s, disabled %s) draws the %s box",
	(open, disabled, state) => {
		mockRoot.open = open;
		render(
			<C.OptionSelect
				tone="attention"
				disabled={disabled}
				placeholder="Status"
				options={[{ value: 'a', label: 'A' }]}
			/>
		);
		expect(mockFieldBox).toHaveBeenLastCalledWith(state);
	}
);

// A native list with no width floor is a blank strip: its rows' labels are flex-1 and lend it none.
it.each([
	['ios', false, { minWidth: 240 }, false],
	['ios', true, { width: 240 }, false],
	['web', false, undefined, true],
] as const)(
	'the anchored list on %s (matchWidth %s) is floored at its trigger',
	(OS, matchWidth, style, cssFloor) => {
		mockPhone.current = false;
		mockPlatform.OS = OS;
		const primitive = jest.requireMock('@rn-primitives/select');
		const Keep = primitive.Content;
		const seen = jest.fn();
		function ContentSpy(props: { style?: unknown; className?: string }) {
			seen(props.style, props.className);
			return null;
		}
		primitive.Content = ContentSpy;
		const trigger = jest.requireMock('./trigger');
		const KeepTrigger = trigger.Trigger;
		let layout: (e: unknown) => void = () => {};
		function TriggerSpy(props: { onLayout: (e: unknown) => void }) {
			layout = props.onLayout;
			return null;
		}
		trigger.Trigger = TriggerSpy;
		try {
			render(
				<C.Select>
					<C.SelectTrigger testID="trigger" />
					<C.SelectContent inline matchWidth={matchWidth}>
						<C.SelectItem value="a" label="A" />
					</C.SelectContent>
				</C.Select>
			);
			act(() => layout({ nativeEvent: { layout: { width: 240 } } }));
			const [lastStyle, className] = seen.mock.calls.at(-1)!;
			expect(lastStyle).toEqual(style);
			expect(className.includes('min-w-(--radix-select-trigger-width)')).toBe(cssFloor);
			expect(className.includes('min-w-32')).toBe(OS === 'ios' && !matchWidth);
		} finally {
			primitive.Content = Keep;
			trigger.Trigger = KeepTrigger;
			mockPlatform.OS = 'web';
		}
	}
);

// The multi-select's rows are the same flex-1 labels: at the bare 128-point fallback they truncate.
it.each([
	['ios', false, 240, { minWidth: 240 }],
	// A trigger narrower than `min-w-32` keeps that floor: the inline minWidth replaces the class.
	['ios', false, 96, { minWidth: 128 }],
	['ios', true, 240, { width: 240 }],
	['web', false, 240, undefined],
	['web', true, 240, { width: 240 }],
] as const)(
	'the multi-select list on %s (matchWidth %s, trigger %s) is floored at its trigger',
	(OS, matchWidth, width, style) => {
		mockPlatform.OS = OS;
		try {
			render(
				<C.Select multiple>
					<C.SelectTrigger />
					<C.SelectContent matchWidth={matchWidth} />
				</C.Select>
			);
			act(() => mockMultiLayout.current({ nativeEvent: { layout: { width } } }));
			expect(mockMultiContent.mock.calls.at(-1)![0]).toEqual(style);
		} finally {
			mockPlatform.OS = 'web';
		}
	}
);
