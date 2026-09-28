import { readFileSync } from 'node:fs';

import * as React from 'react';

import { render } from '@testing-library/react';

import { SortIcon, type SortIconProps } from './index';

jest.mock('../icon', () => ({
	Icon: ({ name, className }: { name: string; className?: string }) => (
		<span data-icon={name} className={className} />
	),
}));

it.each<[SortIconProps, string, string]>([
	[{}, 'caretUp', 'text-transparent'],
	[{ hovered: true }, 'caretUp', 'text-muted-foreground'],
	[{ direction: 'asc' }, 'caretUp', 'text-foreground'],
	[{ direction: 'desc', hovered: true }, 'caretDown', 'text-foreground'],
])('renders one caret for %j', (props, name, colour) => {
	const { container } = render(<SortIcon {...props} />);
	const icons = container.querySelectorAll('[data-icon]');
	expect(icons).toHaveLength(1);
	expect(icons[0]).toHaveAttribute('data-icon', name);
	expect(icons[0]).toHaveClass(colour);
});

it('contains no arbitrary text sizes or palette greys', () => {
	const source = readFileSync(`${__dirname}/index.tsx`, 'utf8');
	expect(source).not.toContain('text-[');
	expect(source).not.toContain('gray');
});
