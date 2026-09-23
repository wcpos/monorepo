import { readFileSync } from 'node:fs';

import * as React from 'react';
import type { PressableProps, ScrollViewProps, TextProps, ViewProps } from 'react-native';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { router } from 'expo-router';

import { Input } from '../../input';
import { DeviceScope } from '../../lib/device';
import { PANEL_SLIDE } from '../../lib/motion';
import { registerPortalContainer } from '../../lib/portal-container';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
	useDialog,
} from './index';

import type * as Primitive from '@rn-primitives/dialog';

const mockPortalCalls: Primitive.PortalProps[] = [];
const mockAutoFocusEvents: { preventDefault: jest.Mock }[] = [];
const mockScrimProps: Primitive.OverlayProps[] = [];
const mockPressableProps: PressableProps[] = [];

jest.mock('react-native', () => {
	const actual = jest.requireActual<typeof import('react-native')>('react-native');
	return {
		...actual,
		useWindowDimensions: () => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }),
		Pressable: (props: PressableProps) => {
			mockPressableProps.push(props);
			return <actual.Pressable {...props} />;
		},
		// Like page-bar's harness, preserve classes that RN-web drops without Uniwind.
		View: ({ children, className, testID }: ViewProps) => (
			<div className={className} data-testid={testID}>
				{children}
			</div>
		),
		ScrollView: ({ children, className, testID }: ScrollViewProps) => (
			<div className={className} data-testid={testID}>
				{children}
			</div>
		),
		Text: ({ children, className, testID }: TextProps) => (
			<span className={className} data-testid={testID}>
				{children}
			</span>
		),
	};
});
jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../keyboard-controller', () => ({
	KeyboardAvoidingView: jest.requireMock('react-native').View,
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn() }));
jest.mock('../../loader', () => ({ Loader: () => null }));
jest.mock('../../icon', () => ({ Icon: () => null }));
jest.mock('../../input', () => ({
	Input: ({ value, onChangeText, placeholder, ...props }: any) => (
		<input
			aria-label={placeholder}
			value={value ?? ''}
			onChange={(event) => onChangeText?.(event.currentTarget.value)}
			{...props}
		/>
	),
}));
jest.mock('@rn-primitives/slot', () => ({
	Slot: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
		React.isValidElement(children) ? React.cloneElement(children, props) : null,
}));
jest.mock('react-native-reanimated', () => {
	const started: { toValue: unknown; callback?: (finished: boolean) => void }[] = [];
	const pending: ((finished: boolean) => void)[] = [];
	return {
		__esModule: true,
		default: { View: ({ children }: React.PropsWithChildren) => <div>{children}</div> },
		Easing: { bezier: () => (value: number) => value },
		...Object.fromEntries(
			[
				'FadeIn',
				'FadeOut',
				'SlideInLeft',
				'SlideOutLeft',
				'SlideInRight',
				'SlideOutRight',
				'SlideInDown',
				'SlideOutDown',
			].map((name) => [
				name,
				{
					duration() {
						return this;
					},
					easing: jest.fn().mockReturnThis(),
				},
			])
		),
		__started: started,
		__pending: pending,
		cancelAnimation: () => pending.splice(0).forEach((callback) => callback(false)),
		useAnimatedStyle: () => ({}),
		useSharedValue: (value: unknown) => ({ value }),
		withSequence: (...animations: unknown[]) => animations,
		withTiming: (toValue: unknown, _config: unknown, callback?: (finished: boolean) => void) => {
			started.push({ toValue, callback });
			if (callback) pending.push(callback);
			return toValue;
		},
	};
});
jest.mock('react-native-worklets', () => ({
	scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) => fn(...args),
}));

// A controllable native-contract stand-in; dismissal/focus-trap internals belong to the primitive.
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
	function Content({
		testID,
		className,
		children,
		onOpenAutoFocus,
		ref,
	}: Omit<Primitive.ContentProps, 'ref'> & { ref?: React.Ref<HTMLDivElement> }) {
		const { open } = useRootContext();
		const autofocus = React.useRef(onOpenAutoFocus);
		// Keep the event callback current without retriggering the primitive's mount event.
		React.useLayoutEffect(() => {
			autofocus.current = onOpenAutoFocus;
		}, [onOpenAutoFocus]);
		// Model the primitive's mount event, including content mounted after a trigger press.
		React.useEffect(() => {
			if (!open) return;
			const event = { preventDefault: jest.fn() };
			mockAutoFocusEvents.push(event);
			autofocus.current?.(event as unknown as Event);
		}, [open]);
		return open ? (
			<div role="dialog" data-testid={testID} className={className} ref={ref}>
				{children}
			</div>
		) : null;
	}
	return {
		useRootContext,
		Root: ({
			open: controlled,
			defaultOpen = false,
			onOpenChange,
			children,
			asChild,
		}: Primitive.RootProps) => {
			const [internal, setInternal] = React.useState(defaultOpen);
			return (
				<Context.Provider
					value={{
						open: controlled ?? internal,
						onOpenChange: (next) => {
							if (controlled === undefined) setInternal(next);
							onOpenChange?.(next);
						},
					}}
				>
					{asChild ? children : <div data-testid="primitive-root">{children}</div>}
				</Context.Provider>
			);
		},
		Trigger: ({ children, testID }: Primitive.TriggerProps) => {
			const { onOpenChange } = useRootContext();
			return (
				<button data-testid={testID} onClick={() => onOpenChange(true)}>
					{typeof children === 'function' ? children({ pressed: false }) : children}
				</button>
			);
		},
		Portal: (props: Primitive.PortalProps) => {
			mockPortalCalls.push(props);
			return <>{props.children}</>;
		},
		Overlay: (props: Primitive.OverlayProps) => {
			mockScrimProps.push(props);
			const { onOpenChange } = useRootContext();
			const mapped = Object.fromEntries(
				Object.entries(props)
					.filter(
						([key]) =>
							![
								'focusable',
								'accessible',
								'importantForAccessibility',
								'accessibilityElementsHidden',
							].includes(key)
					)
					.map(([key, value]) => [key === 'testID' ? 'data-testid' : key, value])
			);
			return <div {...mapped} onClick={() => onOpenChange(false)} />;
		},
		Content,
		Close: ({ children, asChild, testID }: Primitive.CloseProps) => {
			const { onOpenChange } = useRootContext();
			if (asChild && React.isValidElement<{ onPress?: (event: unknown) => void }>(children)) {
				return React.cloneElement(children, {
					onPress: (event: unknown) => {
						onOpenChange(false);
						children.props.onPress?.(event);
					},
				});
			}
			return (
				<button data-testid={testID} onClick={() => onOpenChange(false)}>
					{typeof children === 'function' ? children({ pressed: false }) : children}
				</button>
			);
		},
		Title: ({ children }: Primitive.TitleProps) => <span>{children}</span>,
		Description: ({ children }: Primitive.DescriptionProps) => <span>{children}</span>,
	};
});

beforeEach(() => {
	jest.clearAllMocks();
	mockPortalCalls.length = 0;
	mockAutoFocusEvents.length = 0;
	mockScrimProps.length = 0;
	mockPressableProps.length = 0;
});
afterEach(() => jest.useRealTimers());

it('1. opens from a trigger and closes from the generated close control', () => {
	render(
		<Dialog>
			<DialogTrigger testID="trigger">Open</DialogTrigger>
			<DialogContent inline testID="d">
				Task
			</DialogContent>
		</Dialog>
	);
	expect(screen.queryByTestId('d')).not.toBeInTheDocument();
	expect(screen.queryByTestId('d-scrim')).not.toBeInTheDocument();
	expect(screen.getByTestId('primitive-root')).toBeInTheDocument();
	fireEvent.click(screen.getByTestId('trigger'));
	expect(screen.getByTestId('d')).toBeInTheDocument();
	expect(screen.getByTestId('d-scrim')).toBeInTheDocument();
	fireEvent.click(screen.getByTestId('d-close'));
	expect(screen.queryByTestId('d')).not.toBeInTheDocument();
	expect(screen.queryByTestId('d-scrim')).not.toBeInTheDocument();
});

it('1. slots a single content child without a primitive root wrapper', () => {
	render(
		<Dialog open>
			<DialogContent inline testID="d">
				Task
			</DialogContent>
		</Dialog>
	);
	expect(screen.getByTestId('d')).toBeInTheDocument();
	expect(screen.queryByTestId('primitive-root')).not.toBeInTheDocument();
});

it('2. passes controlled open and onOpenChange through', () => {
	const onOpenChange = jest.fn();
	render(
		<Dialog open onOpenChange={onOpenChange}>
			<DialogContent inline testID="d">
				Task
			</DialogContent>
		</Dialog>
	);
	expect(screen.getByTestId('d')).toBeInTheDocument();
	fireEvent.click(screen.getByTestId('d-close'));
	expect(onOpenChange).toHaveBeenCalledWith(false);
	expect(screen.getByTestId('d')).toBeInTheDocument();
});

function CloseFromContext() {
	const { open, close } = useDialog();
	return (
		<button data-testid="context-close" data-open={open} onClick={close}>
			Done
		</button>
	);
}
it('3. useDialog closes an uncontrolled, default-open dialog', () => {
	render(
		<Dialog defaultOpen>
			<DialogContent inline testID="d">
				<CloseFromContext />
			</DialogContent>
		</Dialog>
	);
	expect(screen.getByTestId('context-close')).toHaveAttribute('data-open', 'true');
	fireEvent.click(screen.getByTestId('context-close'));
	expect(screen.queryByTestId('d')).not.toBeInTheDocument();
});
it('3. useDialog throws outside Dialog', () => {
	expect(() => render(<CloseFromContext />)).toThrow('Dialog context is missing');
});

it.each([undefined, false])(
	'4. route mode forces inline=%s and closes with router.back',
	(inline) => {
		render(
			<Dialog route>
				<DialogContent inline={inline} testID="d">
					Task
				</DialogContent>
			</Dialog>
		);
		expect(screen.getByTestId('d')).toBeInTheDocument();
		expect(mockPortalCalls).toHaveLength(0);
		fireEvent.click(screen.getByTestId('d-close'));
		expect(router.back).toHaveBeenCalledTimes(1);
	}
);
it('4. route mode uses the supplied onClose', () => {
	const onClose = jest.fn();
	render(
		<Dialog route onClose={onClose}>
			<DialogContent testID="d">Task</DialogContent>
		</Dialog>
	);
	fireEvent.click(screen.getByTestId('d-close'));
	expect(onClose).toHaveBeenCalledTimes(1);
	expect(router.back).not.toHaveBeenCalled();
	expect(mockPortalCalls).toHaveLength(0);
});
it('4. route mode without content is safe', () => {
	expect(() => render(<Dialog route />)).not.toThrow();
});
it('4. trigger mode resolves a named portal host to its container', () => {
	const container = document.createElement('div');
	registerPortalContainer('products', container);
	try {
		render(
			<Dialog open>
				<DialogContent portalHost="products" testID="d">
					Task
				</DialogContent>
			</Dialog>
		);
		expect(mockPortalCalls).toContainEqual(
			expect.objectContaining({ hostName: 'products', container })
		);
	} finally {
		act(() => registerPortalContainer('products', null));
	}
});

it.each([
	['center', 'rounded-lg', 'w-160'],
	['right', 'border-l', 'h-full'],
	['left', 'border-r', 'h-full'],
	['bottom', 'rounded-t-2xl', 'max-h-[92%]'],
] as const)(
	'5. %s has its presentation classes and honours only applicable sizes',
	(side, edge, sizing) => {
		render(
			<Dialog open>
				<DialogContent inline testID="d" side={side} size="xl">
					Task
				</DialogContent>
			</Dialog>
		);
		expect(screen.getByTestId('d')).toHaveClass(edge, sizing);
		if (side === 'bottom') expect(screen.getByTestId('d')).not.toHaveClass('w-160');
		else expect(screen.getByTestId('d')).toHaveClass('w-160');
	}
);

it.each(['right', 'left'] as const)(
	'6. phone %s becomes a full page and keeps the close control',
	(side) => {
		render(
			<DeviceScope phone>
				<Dialog open>
					<DialogContent inline testID="d" side={side} size="lg">
						Task
					</DialogContent>
				</Dialog>
			</DeviceScope>
		);
		expect(screen.getByTestId('d')).toHaveClass('w-full', 'border-0');
		expect(screen.getByTestId('d')).not.toHaveClass('w-lg');
		expect(screen.getByTestId('d-close')).toBeInTheDocument();
	}
);
it.each([
	['center', 'rounded-lg'],
	['bottom', 'rounded-t-2xl'],
] as const)('6. phone %s retains its presentation', (side, rounding) => {
	render(
		<DeviceScope phone>
			<Dialog open>
				<DialogContent inline testID="d" side={side}>
					Task
				</DialogContent>
			</Dialog>
		</DeviceScope>
	);
	expect(screen.getByTestId('d')).toHaveClass(rounding);
	expect(screen.getByTestId('d')).not.toHaveClass('border-0');
});

it('7. names the close control and lets callers override its label and testID', () => {
	const { rerender } = render(
		<Dialog open>
			<DialogContent inline testID="d">
				Task
			</DialogContent>
		</Dialog>
	);
	expect(screen.getByTestId('d-close')).toHaveAttribute('aria-label', 'Close');
	expect(
		mockPressableProps.find((props) => props.testID === 'd-close')?.className?.split(' ')
	).toEqual(expect.arrayContaining(['h-ctl', 'w-ctl']));
	rerender(
		<Dialog open>
			<DialogContent inline testID="d" closeLabel="Dismiss" closeButtonProps={{ testID: 'custom' }}>
				Task
			</DialogContent>
		</Dialog>
	);
	expect(screen.getByTestId('custom')).toHaveAttribute('aria-label', 'Dismiss');
	expect(screen.queryByTestId('d-close')).not.toBeInTheDocument();
	rerender(
		<Dialog open>
			<DialogContent inline>Task</DialogContent>
		</Dialog>
	);
	expect(screen.getByTestId('dialog-close')).toBeInTheDocument();
});

it('7. merges caller close classes with the control dimensions', () => {
	render(
		<Dialog open>
			<DialogContent inline testID="d" closeButtonProps={{ className: 'opacity-70' }}>
				Task
			</DialogContent>
		</Dialog>
	);
	expect(
		mockPressableProps.find((props) => props.testID === 'd-close')?.className?.split(' ')
	).toEqual(expect.arrayContaining(['h-ctl', 'w-ctl', 'opacity-70']));
});

it.each(['right', 'center'] as const)(
	'8. %s reserves the close width and applies body/footer flex rules',
	(side) => {
		render(
			<Dialog open>
				<DialogContent inline side={side}>
					<DialogHeader testID="header" />
					<DialogBody testID="body" />
					<DialogFooter testID="footer" />
				</DialogContent>
			</Dialog>
		);
		expect(screen.getByTestId('header')).toHaveClass('pr-ctl');
		if (side === 'right') {
			expect(screen.getByTestId('body')).toHaveClass('flex-1');
			expect(screen.getByTestId('footer')).toHaveClass('border-t');
		} else {
			expect(screen.getByTestId('body')).not.toHaveClass('flex-1');
			expect(screen.getByTestId('footer')).not.toHaveClass('border-t');
		}
	}
);
it('9. titles receive their themed typography through the text context', () => {
	render(
		<Dialog open>
			<DialogContent inline testID="d">
				<DialogTitle testID="title">Email receipt</DialogTitle>
			</DialogContent>
		</Dialog>
	);
	expect(screen.getByTestId('d')).toContainElement(screen.getByTestId('title'));
	expect(screen.getByTestId('title')).toHaveTextContent('Email receipt');
	expect(screen.getByTestId('title')).toHaveClass('text-lg', 'text-foreground');
});

it.each([false, true])(
	'10. the primitive scrim dismisses (route=%s) and cannot take focus',
	(route) => {
		const onOpenChange = jest.fn();
		render(
			<Dialog route={route} open onOpenChange={onOpenChange}>
				<DialogContent inline testID="d">
					Task
				</DialogContent>
			</Dialog>
		);
		fireEvent.click(screen.getByTestId('d-scrim'));
		if (route) expect(router.back).toHaveBeenCalledTimes(1);
		else expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(mockScrimProps.at(-1)).toMatchObject({ focusable: false });
	}
);

it.each(['animation', 'timer'] as const)(
	'11. right defers autofocus until the %s settles',
	(settle) => {
		jest.useFakeTimers();
		render(
			<Dialog open>
				<DialogContent inline testID="d" side="right">
					<Input data-testid="field" placeholder="Email address" />
				</DialogContent>
			</Dialog>
		);
		expect(mockAutoFocusEvents[0].preventDefault).toHaveBeenCalledTimes(1);
		const input = screen.getByTestId('field');
		expect(input).not.toHaveFocus();
		const focus = jest.spyOn(input, 'focus');
		if (settle === 'animation') {
			fireEvent.animationEnd(input);
			expect(input).not.toHaveFocus();
			fireEvent.animationEnd(screen.getByTestId('d'));
		} else act(() => jest.advanceTimersByTime(PANEL_SLIDE + 50));
		expect(input).toHaveFocus();
		expect(focus).toHaveBeenCalledWith({ preventScroll: true });
		act(() => jest.advanceTimersByTime(PANEL_SLIDE + 50));
		expect(focus).toHaveBeenCalledTimes(1);
	}
);
it('11. composes the caller ref with focus after the right panel settles', () => {
	jest.useFakeTimers();
	const ref = React.createRef<Primitive.ContentRef>();
	render(
		<Dialog open>
			<DialogContent inline testID="d" side="right" ref={ref}>
				<Input data-testid="field" placeholder="Email address" />
			</DialogContent>
		</Dialog>
	);
	expect(ref.current).toBe(screen.getByTestId('d'));
	expect(screen.getByTestId('field')).not.toHaveFocus();
	fireEvent.animationEnd(screen.getByTestId('d'));
	expect(screen.getByTestId('field')).toHaveFocus();
});
it('11. center does not defer or focus through the settle path', () => {
	jest.useFakeTimers();
	render(
		<Dialog open>
			<DialogContent inline testID="d" side="center">
				<Input data-testid="field" placeholder="Email address" />
			</DialogContent>
		</Dialog>
	);
	expect(mockAutoFocusEvents[0].preventDefault).not.toHaveBeenCalled();
	fireEvent.animationEnd(screen.getByTestId('d'));
	act(() => jest.advanceTimersByTime(PANEL_SLIDE + 50));
	expect(screen.getByTestId('field')).not.toHaveFocus();
});

it('12. keeps the platform boundary in the shell and exports only the new dialog API', () => {
	const source = readFileSync(`${__dirname}/index.tsx`, 'utf8');
	const shell = readFileSync(`${__dirname}/../../lib/overlay.tsx`, 'utf8');
	expect(source).toContain("'children' | 'asChild'");
	expect(source).not.toContain('Platform');
	expect(shell.match(/Platform\.OS/g)).toHaveLength(1);
	expect(source).not.toMatch(
		/export\s+(?:(?:function|const)\s+useRootContext|\{[^}]*\buseRootContext\b)|useModal|as Panel/
	);
});
