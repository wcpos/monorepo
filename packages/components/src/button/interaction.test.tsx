import * as React from 'react';

import { act, render, screen } from '@testing-library/react';

import { Button } from './index';
import { IconButton } from '../icon-button';
import { TextClassContext } from '../text';

let pressed = false;
let pressable: Record<string, unknown>;
let icon: Record<string, unknown>;
let label: Record<string, unknown>;
jest.mock('react-native', () => ({
	Platform: { OS: 'web' },
	Pressable: (props: Record<string, unknown>) => {
		pressable = props;
		return (
			<button>
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

it('lifts pressed and hovered text into the context and clears each on release', () => {
	const onHoverIn = jest.fn();
	const onHoverOut = jest.fn();
	const tree = () => (
		<Button variant="outline-primary" onHoverIn={onHoverIn} onHoverOut={onHoverOut}>
			<Probe />
		</Button>
	);
	const { rerender } = render(tree());
	expect(screen.getByTestId('context')).not.toHaveClass('text-primary-foreground');
	pressed = true;
	rerender(tree());
	expect(screen.getByTestId('context')).toHaveClass('text-primary-foreground');
	pressed = false;
	rerender(tree());
	expect(screen.getByTestId('context')).not.toHaveClass('text-primary-foreground');
	act(() => (pressable.onHoverIn as (event: object) => void)({}));
	expect(screen.getByTestId('context')).toHaveClass('text-primary-foreground');
	act(() => (pressable.onHoverOut as (event: object) => void)({}));
	expect(screen.getByTestId('context')).not.toHaveClass('text-primary-foreground');
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
	const { rerender } = render(<IconButton name="plus" className="h-ctl w-ctl" />);
	expect(pressable.className).toContain('rounded-lg');
	expect(pressable.className).toContain('active:bg-muted');
	expect(icon.className).toBe('text-muted-foreground');
	rerender(<IconButton name="plus" on size="sm" />);
	expect(icon.className).toBe('text-primary');
	expect(pressable.className).toContain('size-8');
	expect(pressable.hitSlop).toBe(8);
	rerender(<IconButton name="plus" />);
	expect(pressable.className).toContain('size-ctl');
});
