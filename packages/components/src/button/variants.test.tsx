import * as React from 'react';

import { buttonTextVariants, buttonVariants } from './index';

jest.mock('react-native', () => ({
	Platform: { OS: 'web' },
	Pressable: ({ children, onPress, accessibilityLabel, testID, ...props }: any) =>
		React.createElement(
			'button',
			{
				...props,
				'aria-label': accessibilityLabel,
				'data-testid': testID,
				onClick: onPress,
			},
			typeof children === 'function' ? children({ pressed: false }) : children
		),
	View: (props: any) => React.createElement('div', props),
	StyleSheet: { create: (styles: any) => styles },
}));

jest.mock('expo-haptics', () => ({
	impactAsync: jest.fn(),
	ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('../hstack', () => ({
	HStack: ({ children, ...props }: any) => React.createElement('div', props, children),
}));

jest.mock('../icon', () => ({
	Icon: ({ name }: { name: string }) => React.createElement('span', null, name),
}));

jest.mock('../loader', () => ({
	Loader: () => React.createElement('span', null, 'loading'),
}));

jest.mock('../lib/utils', () => ({
	cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

jest.mock('../text', () => {
	const TextClassContext = React.createContext('');

	return {
		TextClassContext,
		Text: ({ children, numberOfLines: _numberOfLines, ...props }: any) =>
			React.createElement('span', props, children),
	};
});

describe('Button variants', () => {
	// Three sizes by role (ruled 2026-10-16). The default rides the floored
	// control token (roadmap#357), so Compact on a finger still gets 44; sm and
	// lg ride the spacing unit, so they scale with the density step too.
	it('has exactly three role sizes: sm 36, default on the control token, lg 56', () => {
		expect(buttonVariants({ size: 'default' })).toContain('h-ctl');
		expect(buttonVariants({ size: 'default' })).not.toContain('h-10');
		expect(buttonVariants({ size: 'sm' })).toContain('h-9');
		expect(buttonVariants({ size: 'lg' })).toContain('h-14');
		// The commit shadow and press belong to the solid lg buttons; an outline lg keeps the pill only
		// (CodeRabbit on #3139), and an outline keeps its 1 px border in every theme.
		const lift = [
			'shadow-commit',
			'active:shadow-commit-press',
			'active:translate-y-[var(--shape-commit-press-y)]',
		];
		for (const variant of ['default', 'destructive'] as const) {
			expect(buttonVariants({ variant, size: 'lg' })).toContain('rounded-commit');
			for (const token of lift) expect(buttonVariants({ variant, size: 'lg' })).toContain(token);
		}
		expect(buttonVariants({ variant: 'outline', size: 'lg' })).toContain('rounded-commit');
		for (const token of lift) {
			expect(buttonVariants({ variant: 'outline', size: 'lg' })).not.toContain(token);
		}
		expect(buttonVariants({ variant: 'outline' })).toContain('border');
		expect(buttonVariants({ variant: 'outline' })).not.toContain(
			'border-[length:var(--shape-ctl-border)]'
		);
		expect(buttonVariants({})).toContain('rounded-control');
	});

	// A small pill is a Chip (ruled 2026-10-16, decision 10): the `xs` size and the tinted
	// `muted`/`ghost-primary`/`ghost-secondary` variants went with ButtonPill.
	it('has no pill size or tinted pill variants left', () => {
		const source = jest
			.requireActual<typeof import('node:fs')>('node:fs')
			.readFileSync(`${__dirname}/index.tsx`, 'utf8');
		expect(source).not.toMatch(/\bxs:|'ghost-primary'|'ghost-secondary'|\bmuted:|ButtonPill/);
	});

	it('gives ghost a muted label at rest that turns to the foreground on hover and press', () => {
		// Text merges the context class through cn (tailwind-merge), so the last colour wins.
		// This file mocks ../lib/utils, so take the real merger.
		const { cn } = jest.requireActual<typeof import('../lib/utils')>('../lib/utils');
		const label = (state: { hovered?: boolean; pressed?: boolean }) =>
			cn(buttonTextVariants({ variant: 'ghost', ...state }));
		expect(label({})).toContain('text-muted-foreground');
		expect(label({ hovered: true })).toContain('text-foreground');
		expect(label({ hovered: true })).not.toContain('text-muted-foreground');
		expect(label({ pressed: true })).not.toContain('text-muted-foreground');
	});

	// A title-bar item (Paul, 2026-10-30): no surface on hover or press; the key-rank label lifts
	// from muted to the foreground instead.
	it('gives bare no surface and a muted key-rank label that lifts on hover and press', () => {
		const { cn } = jest.requireActual<typeof import('../lib/utils')>('../lib/utils');
		expect(buttonVariants({ variant: 'bare' })).not.toMatch(/\bbg-|hover:bg|active:bg/);
		const label = (state: { hovered?: boolean; pressed?: boolean }) =>
			cn(buttonTextVariants({ variant: 'bare', ...state }));
		expect(label({})).toContain('text-muted-foreground');
		expect(label({})).toContain('text-sm');
		expect(label({ hovered: true })).not.toContain('text-muted-foreground');
		expect(label({ pressed: true })).toContain('text-foreground');
		expect(label({ pressed: true })).not.toContain('text-muted-foreground');
	});

	it('sets the sale button label large with the theme commit weight', () => {
		expect(buttonTextVariants({ size: 'lg' })).toContain('text-lg');
		expect(buttonTextVariants({ size: 'lg' })).toContain('font-commit');
	});
});
