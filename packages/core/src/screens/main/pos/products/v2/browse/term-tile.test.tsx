/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { TermRow } from './term-row';
import { ParentTermTile, TermTile } from './term-tile';

jest.mock('@wcpos/components/lib/device', () => ({ usePointer: () => 'fine' }));
jest.mock('../../../../contexts/ui-settings', () => ({
	useUISettings: () => ({ uiSettings: { columns: [{ key: 'image', show: true }] } }),
}));
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
const mockCopyPicture = jest.fn(() => undefined);
const mockDealCards = jest.fn(() => null);
jest.mock('../deal-stack', () => ({
	useCopyPicture: () => mockCopyPicture(),
	useDealCards: () => mockDealCards(),
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
// react-native-web drops `className`; surface it (and a View's style) so the tiles' layout
// classes can be read.
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
		View: forwardRef(function View(
			{ className, style, ...props }: { className?: string; style?: unknown },
			ref: React.Ref<unknown>
		) {
			return (
				<actual.View
					ref={ref}
					{...props}
					style={style}
					dataSet={{ className, style: JSON.stringify(style ?? null) }}
				/>
			);
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

// The card, whatever its picture: the square and its band, which a tint fills whole.
const square = (testID: string) =>
	screen.getByTestId(testID).querySelector('[data-testid="poster-card"]')!;
const squareClasses = (testID: string) => square(testID).getAttribute('data-class-name')!;

describe('TermTile', () => {
	it('renders an image tile with name and count, and reports its press with itself', () => {
		const onPress = jest.fn();
		render(<TermTile term={drinks} onPress={onPress} />);
		expect(screen.getByText('Drinks')).toBeTruthy();
		expect(screen.getByText('12 products')).toBeTruthy();
		expect(screen.getByTestId('browse-term-7-image')).toBeTruthy();
		// A photo category never reads as a photo product: the folder sits on it.
		expect(screen.getByTestId('icon-folder')).toBeTruthy();
		fireEvent.click(screen.getByTestId('browse-term-7'));
		expect(onPress).toHaveBeenCalledWith(drinks, expect.anything());
	});
	it('renders a name on its tint, with the folder, when there is no image', () => {
		render(<TermTile term={snacks} onPress={jest.fn()} />);
		expect(screen.queryByTestId('browse-term-8-image')).toBeNull();
		expect(screen.queryByTestId('term-image')).toBeNull();
		expect(screen.getByText('Snacks')).toBeTruthy();
		// tintOf(8): 8 % 6 = 2.
		expect(squareClasses('browse-term-8')).toContain('bg-tile-tint-2');
		expect(screen.getByTestId('icon-folder')).toBeTruthy();
	});
	it('shows no count on a term the storefront counts as empty (kept for its POS-only products)', () => {
		render(<TermTile term={{ ...snacks, count: 0 }} onPress={jest.fn()} />);
		expect(screen.queryByText(/^\d+ products$/)).toBeNull();
		render(<TermRow term={{ ...snacks, count: 0 }} onPress={jest.fn()} />);
		expect(screen.queryByText(/^\d+ products$/)).toBeNull();
	});
	it('renders All products with its grid glyph on the last tint, and no count', () => {
		render(<TermTile term={{ kind: 'all' }} onPress={jest.fn()} />);
		expect(screen.getByTestId('browse-all-products')).toHaveAttribute('aria-label', 'All products');
		expect(screen.getByTestId('icon-grid')).toBeTruthy();
		expect(squareClasses('browse-all-products')).toContain('bg-tile-tint-5');
		expect(screen.queryByText(/^\d+ products$/)).toBeNull();
	});
	it('renders a shortcut with its sliders glyph and its description under the name', () => {
		render(<TermTile term={breakfast} onPress={jest.fn()} />);
		expect(screen.getByTestId('icon-sliders')).toBeTruthy();
		expect(squareClasses('browse-shortcut-qf-1')).toContain('bg-tile-tint-5');
		expect(screen.getByTestId('poster-words').textContent).toBe('BreakfastHot Food + Bakery');
		// Read at arm's length on the register: the default size, not the row's small print.
		expect(screen.getByText('Hot Food + Bakery')).not.toHaveClass('text-xs');
	});
	it('is invisible while lifted (its copy is out on the stage)', () => {
		render(<TermTile term={snacks} onPress={jest.fn()} lifted />);
		expect(screen.getByTestId('browse-term-8')).toHaveStyle({ opacity: 0 });
	});
	it('grows to its cell in a dealt level, and shares the row with flex-1 elsewhere', () => {
		const { rerender } = render(<TermTile term={snacks} onPress={jest.fn()} />);
		const size = () =>
			screen.getByTestId('browse-term-8').getAttribute('data-class-name')!.split(' ');
		expect(size()).toContain('flex-1');
		expect(size()).toContain('m-1');
		rerender(<TermTile term={snacks} onPress={jest.fn()} dealt />);
		expect(size()).toContain('grow');
		expect(size()).not.toContain('flex-1');
	});
	it('reads on its copy as it reads on the tile, with the way back on the copy', () => {
		const uncategorized = { kind: 'term' as const, id: 9, name: 'Uncategorized', count: 11 };
		const { unmount } = render(<TermTile term={uncategorized} onPress={jest.fn()} />);
		const onTile = screen.getByTestId('poster-words').textContent;
		expect(screen.queryByTestId('browse-parent-badge')).toBeNull();
		unmount();
		render(<ParentTermTile term={uncategorized} onPress={jest.fn()} />);
		expect(screen.getByTestId('poster-words').textContent).toBe(onTile);
		expect(screen.getByTestId('browse-parent-badge')).toBeTruthy();
	});
	it('lets its picture fade in, and falls back to its tint when it fails', () => {
		render(<TermTile term={drinks} onPress={jest.fn()} />);
		const image = screen.getByTestId('term-image');
		expect(image.getAttribute('data-transition')).toBe('undefined');
		expect(image.getAttribute('src')).toBe('https://x/d.jpg');
		fireEvent.error(image);
		expect(screen.queryByTestId('term-image')).toBeNull();
		// tintOf(7): 7 % 6 = 1.
		expect(squareClasses('browse-term-7')).toContain('bg-tile-tint-1');
	});
});

it.each([
	['a term with a picture', drinks, 'browse-term-7'],
	['a term on its tint', snacks, 'browse-term-8'],
	['All products', { kind: 'all' as const }, 'browse-all-products'],
	['a shortcut', breakfast, 'browse-shortcut-qf-1'],
])('draws %s as a stack: it opens onto more tiles', (_, term, testID) => {
	render(<TermTile term={term} onPress={jest.fn()} />);
	expect(screen.getByTestId(testID).querySelector('[data-testid="poster-stack"]')).not.toBeNull();
});

describe('ParentTermTile', () => {
	it('holds the dealt copy only for a picture it shows: a tint deals at once', () => {
		mockCopyPicture.mockClear();
		const { unmount } = render(<ParentTermTile term={{ kind: 'all' }} onPress={jest.fn()} />);
		unmount();
		render(<ParentTermTile term={snacks} onPress={jest.fn()} />);
		expect(mockCopyPicture).not.toHaveBeenCalled();
		render(<ParentTermTile term={drinks} onPress={jest.fn()} />);
		expect(mockCopyPicture).toHaveBeenCalled();
	});
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
		expect(classes).toContain('grow');
		// Every tile that deals is a stack, its slot-0 copy too, fading with the Deal's cards.
		expect(screen.getByTestId('poster-stack')).toBeTruthy();
		expect(mockDealCards).toHaveBeenCalled();
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
