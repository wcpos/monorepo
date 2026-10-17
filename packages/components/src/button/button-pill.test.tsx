import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { ButtonPill, buttonTextVariants, buttonVariants } from './index';

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

describe('ButtonPill', () => {
	it('does not bubble remove clicks to a surrounding trigger', () => {
		const onParentClick = jest.fn();
		const onRemove = jest.fn();

		render(
			<div onClick={onParentClick}>
				<ButtonPill removable onRemove={onRemove}>
					Cashier
				</ButtonPill>
			</div>
		);

		fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

		expect(onRemove).toHaveBeenCalledTimes(1);
		expect(onParentClick).not.toHaveBeenCalled();
	});

	// The filter pills carry their testID on the ButtonPill itself, and E2E clicks
	// them there. Both branches must forward it: a pill grows its remove control the
	// moment a filter is set, and a testID that survives only one branch makes the
	// selector work until the first click and then vanish.
	it.each([
		['inactive', false],
		['active', true],
	])('forwards its own testID to the label button when %s', (_label, removable) => {
		render(
			<ButtonPill testID="filter-pill-categories" removable={removable}>
				Category
			</ButtonPill>
		);

		expect(screen.getByTestId('filter-pill-categories')).toBeInTheDocument();
	});

	it('passes a testID to the remove control', () => {
		render(
			<ButtonPill removable removeTestID="filter-pill-remove-stock_status">
				Stock status
			</ButtonPill>
		);

		expect(screen.getByTestId('filter-pill-remove-stock_status')).toBeInTheDocument();
	});
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
		expect(buttonVariants({})).toContain('rounded-lg');
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

	it('sets the sale button label large and semibold', () => {
		expect(buttonTextVariants({ size: 'lg' })).toContain('text-lg');
		expect(buttonTextVariants({ size: 'lg' })).toContain('font-semibold');
	});
});
