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
	it('keeps a touch-safe hit area with compact label typography', () => {
		expect(buttonVariants({ size: 'compact' })).toContain('h-9');
		expect(buttonTextVariants({ size: 'compact' })).toContain('text-xs');
	});
});
