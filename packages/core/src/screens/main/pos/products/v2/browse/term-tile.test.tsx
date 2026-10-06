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
	Text: ({ children, className }: React.PropsWithChildren<{ className?: string }>) => (
		<span className={className}>{children}</span>
	),
}));
// Off any dealt copy: a picture holds nothing (deal-stack.test.tsx covers the hold).
jest.mock('../deal-stack', () => ({ useCopyPicture: () => undefined }));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/icon', () => ({
	Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));
// The image reports the props the tiles control: its source, its fade and its error path.
jest.mock('@wcpos/components/image', () => ({
	Image: ({
		source,
		transition,
		onError,
	}: {
		source: { uri?: string };
		transition?: number;
		onError?: () => void;
	}) => (
		<img
			data-testid="term-image"
			data-transition={String(transition)}
			src={source.uri}
			onError={onError}
		/>
	),
}));
jest.mock('../../../../components/product/product-image-placeholder', () => ({
	PRODUCT_IMAGE_PLACEHOLDER: 'placeholder.png',
}));
// react-native-web drops `className`; surface it so the pressed-state classes can be read.
jest.mock('react-native', () => {
	const actual = jest.requireActual('react-native');
	const { forwardRef } = jest.requireActual('react');
	return {
		...actual,
		Pressable: forwardRef(function Pressable(
			{ className, ...props }: { className?: string },
			ref: React.Ref<unknown>
		) {
			return <actual.Pressable ref={ref} {...props} dataSet={{ className }} />;
		}),
	};
});

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
		expect(screen.getByTestId('browse-all-products')).toHaveAttribute('aria-label', 'All products');
		expect(screen.queryByText(/^\d+ products$/)).toBeNull();
	});
	it('renders a shortcut with its description', () => {
		render(<TermTile term={breakfast} onPress={jest.fn()} />);
		expect(screen.getByTestId('browse-shortcut-qf-1')).toBeTruthy();
		// Read at arm's length on the register: the default size, not the row's small print.
		expect(screen.getByText('Hot Food + Bakery')).not.toHaveClass('text-xs');
	});
	it('is invisible while lifted (its copy is out on the stage)', () => {
		render(<TermTile term={snacks} onPress={jest.fn()} lifted />);
		expect(screen.getByTestId('browse-term-8')).toHaveStyle({ opacity: 0 });
	});
	it.each([
		['All products', { kind: 'all' as const }, 'browse-all-products'],
		['a shortcut', breakfast, 'browse-shortcut-qf-1'],
		['an image-less term', snacks, 'browse-term-8'],
	])('mutes the whole card of %s and dims it on press', (_, term, testID) => {
		render(<TermTile term={term} onPress={jest.fn()} />);
		const classes = screen.getByTestId(testID).getAttribute('data-class-name')!.split(' ');
		expect(classes).toEqual(expect.arrayContaining(['bg-muted', 'active:opacity-70']));
		expect(classes).not.toContain('active:bg-muted');
	});
	it('presses a picture tile as a product tile does', () => {
		render(<TermTile term={drinks} onPress={jest.fn()} />);
		const classes = screen.getByTestId('browse-term-7').getAttribute('data-class-name')!.split(' ');
		expect(classes).toEqual(expect.arrayContaining(['bg-card', 'active:bg-muted', 'flex-1']));
	});
	it('grows to its row in a dealt cell, and shares the row with flex-1 elsewhere', () => {
		const { rerender } = render(<TermTile term={snacks} onPress={jest.fn()} />);
		const size = () =>
			screen.getByTestId('browse-term-8').getAttribute('data-class-name')!.split(' ');
		expect(size()).toContain('flex-1');
		expect(size()).not.toContain('grow');
		rerender(<TermTile term={snacks} onPress={jest.fn()} grow />);
		expect(size()).toContain('grow');
		expect(size()).not.toContain('flex-1');
	});
	it('lets its picture fade in, and falls back to the placeholder when it fails', () => {
		render(<TermTile term={drinks} onPress={jest.fn()} />);
		const image = screen.getByTestId('term-image');
		expect(image.getAttribute('data-transition')).toBe('undefined');
		expect(image.getAttribute('src')).toBe('https://x/d.jpg');
		fireEvent.error(image);
		expect(screen.getByTestId('term-image').getAttribute('src')).toBe('placeholder.png');
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
		const classes = screen.getByTestId('browse-parent').getAttribute('data-class-name')!.split(' ');
		expect(classes).toEqual(expect.arrayContaining(['bg-muted', 'active:opacity-70', 'grow']));
	});
	it('moves its picture into slot 0 without fading it in again', () => {
		render(<ParentTermTile term={drinks} onPress={jest.fn()} />);
		expect(screen.getByTestId('term-image').getAttribute('data-transition')).toBe('0');
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
