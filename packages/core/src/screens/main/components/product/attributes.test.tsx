/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { ProductAttributes } from './attributes';

const mockActions = {
	setSearch: jest.fn(),
	clearSearch: jest.fn(),
	setFilter: jest.fn(),
	clearFilter: jest.fn(),
};
jest.mock('@wcpos/query', () => ({
	useRecordField: (record: object, select: (value: object) => unknown) => select(record),
}));
jest.mock('../../../../query', () => ({
	useQueryState: () => [],
	useQueryStateActions: () => mockActions,
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string, options?: { count?: number; term?: string }) =>
		`${key}:${options?.count}${options?.term ? `:${options.term}` : ''}`,
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		testID,
		onPress,
		leftIcon,
		rightIcon,
		...props
	}: React.PropsWithChildren<{
		testID: string;
		onPress: () => void;
		leftIcon?: string;
		rightIcon?: string;
		'aria-expanded'?: boolean;
	}>) => (
		<button
			data-testid={testID}
			data-left-icon={leftIcon}
			data-right-icon={rightIcon}
			aria-expanded={props['aria-expanded']}
			onClick={onPress}
		>
			{children}
		</button>
	),
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, onPress }: React.PropsWithChildren<{ onPress?: () => void }>) => (
		<span onClick={onPress}>{children}</span>
	),
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

const record = {
	uuid: 'hoodie',
	payload: {
		variations: [1, 2, 3],
		attributes: [{ id: 1, name: 'Size', variation: true, options: ['S', 'L'] }],
	},
};
const expanded$ = new BehaviorSubject<Record<string, boolean>>({});
const setRowExpanded = jest.fn((id: string, on: boolean) => expanded$.next({ [id]: on }));
function renderAttributes(meta: object, original: object = {}) {
	const props = {
		row: { id: 'row-1', original: { record, ...original } },
		table: { options: { meta: { expanded$, setRowExpanded, ...meta } } },
	} as unknown as React.ComponentProps<typeof ProductAttributes>;
	return render(<ProductAttributes {...props} />);
}
const button = () => screen.getByTestId('variable-product-expand');

beforeEach(() => {
	jest.clearAllMocks();
	expanded$.next({});
});

it('labels the button with the variation count and toggles the row open in the inline style', () => {
	renderAttributes({});
	expect(button().textContent).toBe('products.n_variations:3');
	expect(button().dataset.leftIcon).toBe('chevronRight');
	expect(button().getAttribute('aria-expanded')).toBe('false');
	fireEvent.click(button());
	expect(setRowExpanded).toHaveBeenCalledWith('row-1', true);
	expect(button().dataset.leftIcon).toBe('chevronDown');
	expect(button().getAttribute('aria-expanded')).toBe('true');
});

it('keeps the found-for-term suffix and seeds the variations search with it', () => {
	renderAttributes({}, { childrenSearchCount: 2, parentSearchTerm: 'blue' });
	expect(button().textContent).toBe(
		'products.n_variations:3 - common.variation_found_for_term:2:blue'
	);
	fireEvent.click(button());
	expect(mockActions.setSearch).toHaveBeenCalledWith('blue');
});

it('drills in the drill style, chevron after, no expanded state', () => {
	const drill = jest.fn();
	renderAttributes({ drill });
	expect(button().dataset.rightIcon).toBe('chevronRight');
	expect(button().dataset.leftIcon).toBeUndefined();
	expect(button().hasAttribute('aria-expanded')).toBe(false);
	fireEvent.click(button());
	expect(drill).toHaveBeenCalledWith(expect.objectContaining({ id: 'row-1' }));
	expect(setRowExpanded).not.toHaveBeenCalled();
});

it('keeps the chips: one drills at its option, or expands the row filtered to it', () => {
	const drill = jest.fn();
	const { unmount } = renderAttributes({ drill });
	fireEvent.click(screen.getByText('L'));
	expect(drill).toHaveBeenCalledWith(expect.objectContaining({ id: 'row-1' }), {
		id: 1,
		name: 'Size',
		option: 'L',
	});
	unmount();
	renderAttributes({});
	fireEvent.click(screen.getByText('S'));
	expect(setRowExpanded).toHaveBeenCalledWith('row-1', true);
	expect(mockActions.setFilter).toHaveBeenCalledWith(
		'attributeMatches',
		expect.arrayContaining([expect.objectContaining({ option: 'S' })])
	);
});
