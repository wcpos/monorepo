import { readFileSync } from 'node:fs';

import * as React from 'react';

import { fireEvent, render } from '@testing-library/react';

import { Avatar, getInitials } from './index';

jest.mock('react-native', () => ({
	View: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />,
	Text: ({
		maxFontSizeMultiplier: _,
		...props
	}: React.HTMLAttributes<HTMLSpanElement> & { maxFontSizeMultiplier?: number }) => (
		<span {...props} />
	),
}));
jest.mock('@rn-primitives/slot', () => ({ Slot: () => null }));
jest.mock('../image', () => ({
	Image: ({ onError }: { onError: () => void }) => <img alt="Avatar" onError={onError} />,
}));

it('uses the xs ramp size and muted default surface with foreground initials', () => {
	const { container } = render(<Avatar fallback="PK" size="xs" />);
	expect(container.firstChild).toHaveClass('size-5', 'bg-muted');
	expect(container.querySelector('span')).toHaveClass('text-3xs', 'text-foreground');
});

it('falls back on image error and resets only when source content changes', () => {
	const { container, rerender } = render(<Avatar source={{ uri: 'first' }} fallback="PK" />);
	fireEvent.error(container.querySelector('img')!);
	expect(container.querySelector('img')).toBeNull();
	expect(container.textContent).toBe('PK');
	rerender(<Avatar source={{ uri: 'first' }} fallback="PK" />);
	expect(container.querySelector('img')).toBeNull();
	rerender(<Avatar source={{ uri: 'second' }} fallback="PK" />);
	expect(container.querySelector('img')).not.toBeNull();
});

it('preserves the question mark for an empty name', () => {
	expect(getInitials('  ')).toBe('?');
});

it('contains no arbitrary text sizes or palette greys', () => {
	const source = readFileSync(`${__dirname}/index.tsx`, 'utf8');
	expect(source).not.toContain('text-[');
	expect(source).not.toContain('gray');
});
