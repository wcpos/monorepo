import * as React from 'react';

import { render } from '@testing-library/react';

import { ToneDisc } from './index';

// Uniwind is not compiled in Jest; expose the View's classes.
jest.mock('react-native', () => {
	const React = jest.requireActual('react');
	function View({ testID, ...props }: { testID?: string }) {
		return React.createElement('div', { ...props, 'data-testid': testID });
	}
	return { ...jest.requireActual('react-native'), View };
});
jest.mock('../icon', () => ({
	Icon: ({ name, size, className }: { name: string; size: string; className?: string }) =>
		React.createElement('span', { 'data-icon': name, 'data-size': size, className }),
}));

const glyph = (container: HTMLElement) => container.querySelector('[data-icon]')!;

it.each([
	['ok', 'bg-ok-bg', 'text-ok', 'check'],
	['warn', 'bg-warn-bg', 'text-warn-text', 'warning'],
	['bad', 'bg-bad-bg', 'text-bad', 'alert'],
	['muted', 'bg-muted', 'text-muted-foreground', 'info'],
] as const)('paints the %s tone as a wash and its own glyph', (tone, wash, ink, icon) => {
	const { container } = render(<ToneDisc tone={tone} testID="disc" />);
	expect(glyph(container).parentElement).toHaveClass('rounded-full', wash);
	expect(glyph(container)).toHaveAttribute('data-icon', icon);
	expect(glyph(container)).toHaveClass(ink);
});

it.each([
	['sm', 'size-11', 'default'],
	[undefined, 'size-14', '2xl'],
	['lg', 'size-24', '4xl'],
] as const)('sizes the disc and its glyph together (%s)', (size, disc, icon) => {
	const { container } = render(<ToneDisc tone="ok" size={size} />);
	expect(glyph(container).parentElement).toHaveClass(disc);
	expect(glyph(container)).toHaveAttribute('data-size', icon);
});

it('lets a named glyph win over the tone glyph', () => {
	const { container } = render(<ToneDisc tone="warn" icon="pending" />);
	expect(glyph(container)).toHaveAttribute('data-icon', 'pending');
});
