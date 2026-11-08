import * as React from 'react';
import type { PressableProps, ScrollViewProps, TextProps, ViewProps } from 'react-native';

import { fireEvent, render, screen } from '@testing-library/react';

import * as real from './index';
import * as fake from './testing';

import type * as Primitive from '@rn-primitives/dialog';

/**
 * Pins `./testing` to the real dialog: the same props give the same testIDs, the same button
 * names, the same heading and the same open/close behaviour. The harness is `index.test.tsx`'s,
 * trimmed to what rendering needs.
 */
jest.mock('react-native', () => {
	const actual = jest.requireActual<typeof import('react-native')>('react-native');
	return {
		...actual,
		useWindowDimensions: () => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }),
		Pressable: ({
			children,
			testID,
			onPress,
			disabled,
			accessibilityLabel,
		}: PressableProps & { testID?: string }) => (
			<button
				data-testid={testID}
				disabled={!!disabled}
				aria-label={accessibilityLabel ?? undefined}
				onClick={onPress as unknown as React.MouseEventHandler}
			>
				{typeof children === 'function' ? children({ pressed: false }) : children}
			</button>
		),
		View: ({ children, testID }: ViewProps) => <div data-testid={testID}>{children}</div>,
		ScrollView: ({ children, testID }: ScrollViewProps) => (
			<div data-testid={testID}>{children}</div>
		),
		Text: ({
			children,
			testID,
			role,
			'aria-level': level,
		}: TextProps & { role?: string; 'aria-level'?: number }) => (
			<span data-testid={testID} role={role} aria-level={level}>
				{children}
			</span>
		),
	};
});
jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../keyboard-controller', () => ({
	KeyboardAvoidingView: jest.requireMock('react-native').View,
}));
jest.mock('../lib/overlay', () => ({
	__esModule: true,
	...jest.requireActual('../lib/overlay'),
	isWeb: true,
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn() }));
jest.mock('../loader', () => ({ Loader: () => null }));
jest.mock('../icon', () => ({ Icon: () => null }));
jest.mock('@rn-primitives/slot', () => ({
	Slot: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
		React.isValidElement(children) ? React.cloneElement(children, props) : null,
}));
jest.mock('react-native-worklets', () => ({
	scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) => fn(...args),
}));
// The native-contract stand-in `index.test.tsx` uses: open state, Close, Trigger and Content.
jest.mock('@rn-primitives/dialog', () => {
	const Context = React.createContext<{
		open: boolean;
		onOpenChange: (open: boolean) => void;
	} | null>(null);
	function useRootContext() {
		const context = React.useContext(Context);
		if (!context) throw new Error('Dialog context is missing');
		return context;
	}
	return {
		useRootContext,
		Root: ({
			open: controlled,
			defaultOpen = false,
			onOpenChange,
			children,
		}: Primitive.RootProps) => {
			const [internal, setInternal] = React.useState(defaultOpen);
			const value = {
				open: controlled ?? internal,
				onOpenChange: (next: boolean) => {
					if (controlled === undefined) setInternal(next);
					onOpenChange?.(next);
				},
			};
			return <Context.Provider value={value}>{children}</Context.Provider>;
		},
		Trigger: ({ children, testID }: Primitive.TriggerProps) => {
			const { onOpenChange } = useRootContext();
			return (
				<button data-testid={testID} onClick={() => onOpenChange(true)}>
					{typeof children === 'function' ? children({ pressed: false }) : children}
				</button>
			);
		},
		Portal: (props: Primitive.PortalProps) => <>{props.children}</>,
		// As Radix on web: the scrim holds the panel, and goes with it.
		Overlay: ({ children }: Primitive.OverlayProps) =>
			useRootContext().open ? <div>{children as React.ReactNode}</div> : null,
		Content: ({ testID, children }: Primitive.ContentProps) =>
			useRootContext().open ? (
				<div role="dialog" data-testid={testID}>
					{children}
				</div>
			) : null,
		Close: ({ children, asChild }: Primitive.CloseProps) => {
			const { onOpenChange } = useRootContext();
			return asChild && React.isValidElement<{ onPress?: (event: unknown) => void }>(children)
				? React.cloneElement(children, {
						onPress: (event: unknown) => {
							onOpenChange(false);
							children.props.onPress?.(event);
						},
					})
				: null;
		},
		Title: ({ children }: Primitive.TitleProps) => <>{children}</>,
		Description: ({ children, testID }: Primitive.DescriptionProps) => (
			<span data-testid={testID}>{children}</span>
		),
	};
});

type Module = typeof fake;
const both: [string, Module][] = [
	['real', real as unknown as Module],
	['fake', fake],
];
const ids = () =>
	Array.from(document.body.querySelectorAll('[data-testid]'), (node) =>
		node.getAttribute('data-testid')
	);

describe.each(both)('%s dialog', (_name, m) => {
	const sheet = (props: Partial<real.DialogFooterProps> = {}, content = {}) => (
		<m.Dialog open onOpenChange={onOpenChange}>
			<m.DialogContent testID="d" {...content}>
				<m.DialogHeader>
					<m.DialogTitle testID="title">Title</m.DialogTitle>
					<m.DialogDescription testID="description">Words</m.DialogDescription>
				</m.DialogHeader>
				<m.DialogBody testID="body">Body</m.DialogBody>
				<m.DialogFooter
					testID="f"
					intent={{ label: 'Save', testID: 'save', onPress: onSave }}
					secondary={[{ label: 'Draft', testID: 'draft' }, false]}
					record={{ label: 'Sync', testID: 'sync', disabled: true }}
					destructive={[null, { label: 'Delete', testID: 'delete' }]}
					{...props}
				/>
			</m.DialogContent>
		</m.Dialog>
	);
	const onOpenChange = jest.fn();
	const onSave = jest.fn();
	beforeEach(() => jest.clearAllMocks());

	it('gives every part and button the same testID', () => {
		render(sheet());
		expect(ids()).toEqual(
			expect.arrayContaining(['d', 'd-close', 'title', 'description', 'body', 'f', 'f-close'])
		);
		for (const id of ['save', 'draft', 'sync', 'delete', 'f-close', 'd-close']) {
			expect(screen.getByTestId(id).closest('button')).not.toBeNull();
		}
		expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Title');
	});

	it('names the dismiss Cancel beside an intent, Close without one or in a record shell', () => {
		const { rerender } = render(sheet());
		expect(screen.getByTestId('f-close')).toHaveTextContent('Cancel');
		rerender(sheet({ intent: null }));
		expect(screen.getByTestId('f-close')).toHaveTextContent('Close');
		rerender(<m.DismissIsClose>{sheet()}</m.DismissIsClose>);
		expect(screen.getByTestId('f-close')).toHaveTextContent('Close');
		expect(screen.getByTestId('d-close')).toHaveAttribute('aria-label', 'Close');
	});

	it('presses a slot, disables a disabled one, and closes from either dismiss', () => {
		render(sheet());
		fireEvent.click(screen.getByTestId('save'));
		expect(onSave).toHaveBeenCalledTimes(1);
		expect(screen.getByTestId('sync').closest('button')).toBeDisabled();
		fireEvent.click(screen.getByTestId('f-close'));
		fireEvent.click(screen.getByTestId('d-close'));
		expect(onOpenChange.mock.calls).toEqual([[false], [false]]);
	});

	it('takes the close testIDs it is given, and falls back to the dialog defaults', () => {
		const { rerender } = render(
			sheet({ close: { testID: 'cancel' } }, { closeButtonProps: { testID: 'x' } })
		);
		expect(ids()).toEqual(expect.arrayContaining(['cancel', 'x']));
		expect(ids()).not.toContain('f-close');
		rerender(sheet({ testID: undefined }, { testID: undefined }));
		expect(ids()).toEqual(expect.arrayContaining(['dialog-close', 'dialog-footer-close']));
		rerender(sheet({ close: false }));
		expect(ids()).not.toContain('f-close');
	});

	it('renders no content while closed, and opens from its trigger', () => {
		render(
			<m.Dialog>
				<m.DialogTrigger testID="open">Open</m.DialogTrigger>
				<m.DialogContent testID="d">Task</m.DialogContent>
			</m.Dialog>
		);
		expect(screen.queryByTestId('d')).toBeNull();
		fireEvent.click(screen.getByTestId('open'));
		expect(screen.getByTestId('d')).toHaveTextContent('Task');
	});

	it('holds a route dialog open and hands its dismissal to onClose', () => {
		const onClose = jest.fn();
		render(
			<m.Dialog route onClose={onClose}>
				<m.DialogContent testID="d">Task</m.DialogContent>
			</m.Dialog>
		);
		fireEvent.click(screen.getByTestId('d-close'));
		expect(onClose).toHaveBeenCalledTimes(1);
		expect(screen.getByTestId('d')).toBeTruthy();
	});
});
