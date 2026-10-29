import * as React from 'react';
import type { PressableProps } from 'react-native';

import { fireEvent, render, screen } from '@testing-library/react';

import { AlertDialogFooter } from '../alert-dialog';
import { Button } from '../button';
import { DeviceScope } from '../lib/device';
import {
	Dialog,
	DialogFooter,
	DialogLabelsProvider,
	DismissIsClose,
	type FooterButton,
} from './index';

let mockPresentation: string | undefined = 'right';
jest.mock('../lib/overlay', () => ({ useOverlayPresentation: () => mockPresentation }));
beforeEach(() => {
	mockPresentation = 'right';
});
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('../icon-button', () => ({ IconButton: () => null }));
jest.mock('../loader', () => ({ Loader: () => <span>Loading</span> }));
jest.mock('../icon', () => ({ Icon: ({ name }: { name: string }) => <span>{name}</span> }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn() }));
jest.mock('react-native', () => ({
	...jest.requireActual('react-native'),
	useWindowDimensions: () => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }),
	View: ({ children, className, testID }: React.ComponentProps<'div'> & { testID?: string }) => (
		<div className={className} data-testid={testID}>
			{children}
		</div>
	),
	Pressable: ({
		children,
		className,
		testID,
		onPress,
		disabled,
		accessibilityLabel,
		ref,
	}: PressableProps & { ref?: React.Ref<HTMLButtonElement> }) => (
		<button
			ref={ref}
			className={className}
			data-testid={testID}
			disabled={disabled ?? false}
			aria-label={accessibilityLabel}
			onClick={onPress as unknown as React.MouseEventHandler}
		>
			{typeof children === 'function' ? children({ pressed: false }) : children}
		</button>
	),
}));
jest.mock('@rn-primitives/dialog', () => {
	const Context = React.createContext<((open: boolean) => void) | undefined>(undefined);
	return {
		Root: ({
			children,
			onOpenChange,
		}: React.PropsWithChildren<{ onOpenChange: (open: boolean) => void }>) => (
			<Context.Provider value={onOpenChange}>{children}</Context.Provider>
		),
		Close: ({
			children,
		}: {
			children: React.ReactElement<React.ComponentProps<typeof Button>>;
		}) => {
			const change = React.useContext(Context);
			if (!change)
				throw new Error(
					'Dialog compound components cannot be rendered outside the Dialog component'
				);
			return React.cloneElement(children, {
				onPress: (event) => {
					children.props.onPress?.(event);
					change(false);
				},
			});
		},
	};
});

const action = (label: string): FooterButton => ({ label, testID: label });
const slots = {
	intent: action('Intent'),
	secondary: [action('Secondary'), action('Other')],
	record: action('Record'),
	destructive: action('Destructive'),
	close: { testID: 'Close' },
	aside: <span data-testid="Aside">Aside</span>,
};
function footer(
	props: React.ComponentProps<typeof DialogFooter> = {},
	phone = false,
	onOpenChange = jest.fn(),
	recordShell = false
) {
	const content = <DialogFooter testID="footer" {...props} />;
	return render(
		<DeviceScope phone={phone}>
			<Dialog open onOpenChange={onOpenChange}>
				<DialogLabelsProvider labels={{ close: 'Dismiss', cancel: 'Cancel draft' }}>
					{recordShell ? <DismissIsClose>{content}</DismissIsClose> : content}
				</DialogLabelsProvider>
			</Dialog>
		</DeviceScope>
	);
}
it('renders translated Close beside an intent inside DismissIsClose', () => {
	footer({ intent: action('Intent'), close: true }, false, jest.fn(), true);
	expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
	expect(screen.queryByText('Cancel draft')).not.toBeInTheDocument();
});
it('renders translated Close by default', () => {
	footer({});
	expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
});
it('omits the dismiss when close is false beside an intent', () => {
	footer({ close: false, intent: action('Intent') });
	expect(screen.queryByText('Dismiss')).not.toBeInTheDocument();
	expect(screen.queryByText('Cancel draft')).not.toBeInTheDocument();
	expect(screen.getAllByRole('button')).toHaveLength(1);
});
it('omits the dismiss outside an overlay shell even with close true', () => {
	mockPresentation = undefined;
	render(
		<DialogLabelsProvider labels={{ close: 'Dismiss', cancel: 'Cancel draft' }}>
			<DialogFooter close />
		</DialogLabelsProvider>
	);
	expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
it.each([
	[false, ['Aside', 'Destructive', 'Record', 'Close', 'Secondary', 'Other', 'Intent']],
	[true, ['Intent', 'Secondary', 'Other', 'Close', 'Record', 'Destructive', 'Aside']],
] as const)('orders every role explicitly (phone=%s)', (phone, order) => {
	footer(slots, phone);
	expect(
		Array.from(screen.getByTestId('footer').querySelectorAll('[data-testid]')).map((el) =>
			el.getAttribute('data-testid')
		)
	).toEqual(order);
	expect(screen.getByTestId('Intent')).toHaveClass('bg-primary');
	expect(screen.getByTestId('Destructive')).toHaveClass('border-destructive', 'bg-card');
	for (const name of ['Secondary', 'Other', 'Record', 'Close'])
		expect(screen.getByTestId(name)).toHaveClass('border-border', 'bg-card');
	if (phone)
		for (const button of screen.getAllByRole('button')) expect(button).toHaveClass('w-full');
	expect(screen.getByTestId('footer')).toHaveClass(
		'px-4',
		'gap-2',
		'max-w-full',
		'border-t',
		'pt-4'
	);
});
it('chooses translated Cancel with intent and Close without; close dismisses', () => {
	const change = jest.fn();
	const pressed = jest.fn();
	const view = footer({ intent: action('Intent'), close: { onPress: pressed } }, false, change);
	fireEvent.click(screen.getByText('Cancel draft'));
	expect(pressed).toHaveBeenCalledTimes(1);
	expect(change).toHaveBeenCalledWith(false);
	view.unmount();
	footer({ close: true });
	expect(screen.getByText('Dismiss')).toBeInTheDocument();
});
it.each(['default', 'lg'] as const)('only a lone lg button fills the row (%s)', (size) => {
	footer({ size, intent: action('Intent'), close: false });
	expect(screen.getByTestId('Intent').classList.contains('flex-1')).toBe(size === 'lg');
	expect(screen.getByTestId('Intent')).toHaveClass(size === 'lg' ? 'h-14' : 'h-ctl');
});
it('gives only the trailing group the remaining width beside an aside', () => {
	footer({ size: 'lg', intent: action('Intent'), aside: slots.aside, close: false });
	expect(screen.getByTestId('Aside').parentElement).not.toHaveClass('flex-1');
	expect(screen.getByTestId('Intent').parentElement).toHaveClass('flex-1');
	expect(screen.getByTestId('Intent')).toHaveClass('flex-1');
});
it.each([false, null, undefined])('omits the leading group for an absent aside (%s)', (aside) => {
	footer({ aside, close: true });
	expect(screen.getByTestId('footer')).toHaveClass('justify-end');
	expect(screen.getByTestId('footer').children).toHaveLength(1);
});
// A footer outside any shell (a Reports panel's phone page) is a page's footer, ruled above.
it.each(['center', 'right', undefined])(
	'draws the slot footer top rule only outside center (%s)',
	(side) => {
		mockPresentation = side;
		footer({ close: true });
		expect(screen.getByTestId('footer').classList.contains('border-t')).toBe(side !== 'center');
	}
);
it('passes size to all roles and forwards icon, loading, disabled and press', () => {
	const onPress = jest.fn();
	footer({
		...slots,
		size: 'lg',
		intent: { ...action('Intent'), onPress, icon: 'print', accessibilityLabel: 'Send' },
		record: { ...action('Record'), loading: true },
		secondary: { ...action('Secondary'), disabled: true },
	});
	for (const button of screen.getAllByRole('button')) expect(button).toHaveClass('h-14');
	expect(screen.getByText('print')).toBeInTheDocument();
	expect(screen.getByText('Loading')).toBeInTheDocument();
	expect(screen.getByTestId('Record')).toBeDisabled();
	expect(screen.getByTestId('Secondary')).toBeDisabled();
	fireEvent.click(screen.getByRole('button', { name: 'Send' }));
	expect(onPress).toHaveBeenCalledTimes(1);
});
// @ts-expect-error A caller chooses a role, never a variant.
const forbidden: FooterButton = { label: 'Sync', variant: 'default' };
void forbidden;

// @ts-expect-error Slot callers cannot supply legacy layout classes.
const forbiddenDialogClass = <DialogFooter close className="flex-1" />;
// @ts-expect-error Slot callers cannot supply legacy styles.
const forbiddenDialogStyle = <DialogFooter close style={{ flex: 1 }} />;
// @ts-expect-error Footers cannot supply layout props.
const missingDialogChildren = <DialogFooter className="flex-1" />;
// @ts-expect-error Slot confirmations require a confirm action.
const missingConfirm = <AlertDialogFooter />;
// @ts-expect-error Slot confirmations cannot supply legacy layout props.
const forbiddenAlertClass = <AlertDialogFooter confirm={action('Confirm')} className="flex-1" />;
// @ts-expect-error Slot confirmations cannot supply legacy styles.
const forbiddenAlertStyle = <AlertDialogFooter confirm={action('Confirm')} style={{ flex: 1 }} />;
// @ts-expect-error Alert footers cannot supply layout props.
const missingAlertChildren = <AlertDialogFooter className="flex-1" />;
void [
	forbiddenDialogClass,
	forbiddenDialogStyle,
	missingDialogChildren,
	missingConfirm,
	forbiddenAlertClass,
	forbiddenAlertStyle,
	missingAlertChildren,
];

it('skips false and null slot entries, so a conditional button needs no array juggling', () => {
	render(
		<Dialog open onOpenChange={() => {}}>
			<DialogFooter
				intent={false}
				secondary={[{ label: 'Print', testID: 'print' }, false, null]}
				record={null}
				destructive={[undefined, { label: 'Void', testID: 'void' }]}
				close
			/>
		</Dialog>
	);
	expect(screen.getByTestId('print')).toBeTruthy();
	expect(screen.getByTestId('void')).toBeTruthy();
	expect(screen.getAllByRole('button')).toHaveLength(3);
	// No intent survived, so the dismiss reads Close.
	expect(screen.getByText('Close')).toBeTruthy();
});

it('hands a slot ref to the rendered button, so a caller can return focus to it', () => {
	const ref = React.createRef<HTMLButtonElement>();
	render(
		<Dialog open onOpenChange={() => {}}>
			<DialogFooter
				secondary={{ label: 'Email receipt', testID: 'email', ref: ref as never }}
				close
			/>
		</Dialog>
	);
	expect(ref.current).toBe(screen.getByTestId('email'));
});

const forbiddenDialogChildren = (
	// @ts-expect-error Footer children are no longer accepted.
	<DialogFooter>
		<Button>Legacy</Button>
	</DialogFooter>
);
const forbiddenAlertChildren = (
	// @ts-expect-error Alert footer children are no longer accepted.
	<AlertDialogFooter confirm={{ label: 'Delete' }}>
		<Button>Legacy</Button>
	</AlertDialogFooter>
);
void [forbiddenDialogChildren, forbiddenAlertChildren];
