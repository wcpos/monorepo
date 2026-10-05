/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { TermRow } from './term-row';
import { ParentTermTile, TermTile } from './term-tile';

jest.mock('../../../../../../contexts/translations', () => ({
	useT: () => (key: string, vars?: { count?: number }) =>
		key === 'pos_products.n_products'
			? `${vars?.count} products`
			: key === 'pos_products.browse_all_products'
				? 'All products'
				: key,
}));
// The leaf components pull in native-only modules; the tiles' own structure is what is tested.
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/icon', () => ({
	Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));
jest.mock('@wcpos/components/image', () => ({ Image: () => null }));

const drinks = {
	kind: 'term' as const,
	id: 7,
	name: 'Drinks',
	count: 12,
	imageSrc: 'https://x/d.jpg',
};
const snacks = { kind: 'term' as const, id: 8, name: 'Snacks', count: 4 };
const breakfast = {
	kind: 'shortcut' as const,
	id: 'qf-1',
	name: 'Breakfast',
	description: 'Hot Food + Bakery',
};

describe('TermTile', () => {
	it('renders an image tile with name and count, and reports its press with itself', () => {
		const onPress = jest.fn();
		render(<TermTile term={drinks} onPress={onPress} />);
		expect(screen.getByText('Drinks')).toBeTruthy();
		expect(screen.getByText('12 products')).toBeTruthy();
		expect(screen.getByTestId('browse-term-7-image')).toBeTruthy();
		fireEvent.click(screen.getByTestId('browse-term-7'));
		expect(onPress).toHaveBeenCalledWith(drinks, expect.anything());
	});
	it('renders a name-on-muted tile when there is no image', () => {
		render(<TermTile term={snacks} onPress={jest.fn()} />);
		expect(screen.queryByTestId('browse-term-8-image')).toBeNull();
		expect(screen.getByText('Snacks')).toBeTruthy();
	});
	it('shows no count on a term the storefront counts as empty (kept for its POS-only products)', () => {
		render(<TermTile term={{ ...snacks, count: 0 }} onPress={jest.fn()} />);
		expect(screen.queryByText(/^\d+ products$/)).toBeNull();
		render(<TermRow term={{ ...snacks, count: 0 }} onPress={jest.fn()} />);
		expect(screen.queryByText(/^\d+ products$/)).toBeNull();
	});
	it('renders All products with no count', () => {
		render(<TermTile term={{ kind: 'all' }} onPress={jest.fn()} />);
		expect(screen.getByTestId('browse-all-products')).toBeTruthy();
		expect(screen.queryByText(/^\d+ products$/)).toBeNull();
	});
	it('renders a shortcut with its description', () => {
		render(<TermTile term={breakfast} onPress={jest.fn()} />);
		expect(screen.getByTestId('browse-shortcut-qf-1')).toBeTruthy();
		expect(screen.getByText('Hot Food + Bakery')).toBeTruthy();
	});
	it('is invisible while lifted (its copy is out on the stage)', () => {
		render(<TermTile term={snacks} onPress={jest.fn()} lifted />);
		expect(screen.getByTestId('browse-term-8')).toHaveStyle({ opacity: 0 });
	});
});

describe('ParentTermTile', () => {
	it('is the way back', () => {
		const back = jest.fn();
		render(<ParentTermTile term={drinks} onPress={back} />);
		fireEvent.click(screen.getByTestId('browse-parent'));
		expect(back).toHaveBeenCalled();
	});
	it('composes All products as slot 0 without assuming a term', () => {
		render(<ParentTermTile term={{ kind: 'all' }} onPress={jest.fn()} />);
		expect(screen.getByText('All products')).toBeTruthy();
		expect(screen.getByTestId('icon-grid')).toBeTruthy();
		expect(screen.queryByText(/^\d+ products$/)).toBeNull();
	});
});

describe('TermRow', () => {
	it('renders name, count and reports its press', () => {
		const onPress = jest.fn();
		render(<TermRow term={drinks} onPress={onPress} />);
		expect(screen.getByText('12 products')).toBeTruthy();
		fireEvent.click(screen.getByTestId('browse-term-7'));
		expect(onPress).toHaveBeenCalledWith(drinks);
	});
});
