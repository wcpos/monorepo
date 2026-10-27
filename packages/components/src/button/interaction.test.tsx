import * as React from 'react';

import { act, render, screen } from '@testing-library/react';

import { Button, type ButtonRef } from './index';
import { IconButton } from '../icon-button';
import { TextClassContext } from '../text';

let pressed = false;
let pressable: Record<string, unknown>;
let icon: Record<string, unknown>;
let label: Record<string, unknown>;
jest.mock('react-native', () => ({
	Platform: { OS: 'web' },
	// The under-44 icon buttons mount a press band (icon-button ledger line 7).
	View: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	Pressable: (props: Record<string, unknown>) => {
		pressable = props;
		return (
			<button ref={props.ref as React.Ref<HTMLButtonElement>}>
				{typeof props.children === 'function'
					? props.children({ pressed })
					: (props.children as React.ReactNode)}
			</button>
		);
	},
}));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn() }));
jest.mock('../hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('../loader', () => ({ Loader: () => null }));
jest.mock('../icon', () => ({
	Icon: (props: Record<string, unknown>) => {
		icon = props;
		return null;
	},
}));
jest.mock('../text', () => ({
	TextClassContext: React.createContext(''),
	Text: (props: Record<string, unknown>) => {
		label = props;
		return <span>{props.children as React.ReactNode}</span>;
	},
}));
function Probe() {
	return <span data-testid="context" className={React.useContext(TextClassContext)} />;
}

it('hands its ref to the Pressable, so the caller holds the rendered element', () => {
	const ref = React.createRef<ButtonRef>();
	render(<Button ref={ref}>Email</Button>);
	expect(ref.current).toBe(screen.getByRole('button'));
});

it('lifts pressed and hovered text into the context and clears each on release', () => {
	const onHoverIn = jest.fn();
	const onHoverOut = jest.fn();
	const tree = () => (
		<Button variant="outline-destructive" onHoverIn={onHoverIn} onHoverOut={onHoverOut}>
			<Probe />
		</Button>
	);
	const { rerender } = render(tree());
	expect(screen.getByTestId('context')).not.toHaveClass('text-destructive-foreground');
	pressed = true;
	rerender(tree());
	expect(screen.getByTestId('context')).toHaveClass('text-destructive-foreground');
	pressed = false;
	rerender(tree());
	expect(screen.getByTestId('context')).not.toHaveClass('text-destructive-foreground');
	act(() => (pressable.onHoverIn as (event: object) => void)({}));
	expect(screen.getByTestId('context')).toHaveClass('text-destructive-foreground');
	act(() => (pressable.onHoverOut as (event: object) => void)({}));
	expect(screen.getByTestId('context')).not.toHaveClass('text-destructive-foreground');
	expect(onHoverIn).toHaveBeenCalledTimes(1);
	expect(onHoverOut).toHaveBeenCalledTimes(1);
});
it('keeps a single-line label and the disabled pointer treatment', () => {
	render(<Button disabled>Add product</Button>);
	expect(label.numberOfLines).toBe(1);
	expect(pressable.className).toContain('opacity-45');
	expect(pressable.className).toContain('web:pointer-events-none');
});
it('sizes icon roots separately from their glyphs and supports on', () => {
	const { rerender } = render(
		<IconButton name="plus" accessibilityLabel="Add" className="h-ctl w-ctl" />
	);
	expect(pressable.className).toContain('rounded-lg');
	expect(pressable.className).toContain('active:bg-muted');
	expect(icon.className).toBe('text-muted-foreground');
	rerender(<IconButton name="plus" accessibilityLabel="Add" on size="sm" />);
	expect(icon.className).toBe('text-primary');
	expect(pressable.className).toContain('size-8');
	expect(pressable.hitSlop).toBe(8);
	rerender(<IconButton name="plus" accessibilityLabel="Add" />);
	expect(pressable.className).toContain('size-ctl');
});
it('grows a sm button to a 44 pt target on native, measured, and keeps a caller slop', () => {
	const platform = jest.requireMock<{ Platform: { OS: string } }>('react-native').Platform;
	platform.OS = 'ios';
	try {
		const onLayout = jest.fn();
		const { rerender } = render(
			<Button size="sm" onLayout={onLayout}>
				Retry
			</Button>
		);
		const layout = { nativeEvent: { layout: { x: 0, y: 0, width: 80, height: 36 } } };
		act(() => (pressable.onLayout as (event: object) => void)(layout));
		expect(onLayout).toHaveBeenCalledWith(layout);
		expect(pressable.hitSlop).toEqual({ top: 4, bottom: 4, left: 0, right: 0 });
		rerender(
			<Button size="sm" hitSlop={0}>
				Retry
			</Button>
		);
		expect(pressable.hitSlop).toBe(0);
		rerender(<Button>Retry</Button>);
		expect(pressable.hitSlop).toBeUndefined();
	} finally {
		platform.OS = 'web';
	}
});
