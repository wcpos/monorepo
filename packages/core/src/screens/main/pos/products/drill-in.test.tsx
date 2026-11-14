/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { DrillIn } from './drill-in';
import { VariableProductRow } from './rows/variable-product-row';

jest.mock('@wcpos/query', () => ({
	useDocField: (record: object, select: (value: object) => unknown) => select(record),
}));
jest.mock('@wcpos/components/lib/device', () => ({
	useIsPhone: () => false,
	usePointer: () => 'fine',
}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('./deal-stack', () => ({
	DealFade: ({ children }: React.PropsWithChildren) => (
		<div data-testid="crumb-fades">{children}</div>
	),
}));
// Every pane instance mounted, so a test can tell a reused pane from a fresh one.
const mockPaneMounts: string[] = [];
jest.mock('./variations-pane', () => {
	const ReactActual = jest.requireActual('react') as typeof React;
	return {
		VariationsPane: ({ back, parent }: { back?: () => void; parent: { uuid: string } }) => {
			ReactActual.useEffect(() => {
				mockPaneMounts.push(parent.uuid);
				// Mount-only on purpose: a re-render with a new parent is the reuse under test.
			}, []);
			return <button data-testid="variations" data-tiles={!!back} onClick={back} />;
		},
	};
});
jest.mock('@wcpos/components/button', () => ({
	Button: React.forwardRef<
		HTMLButtonElement,
		React.PropsWithChildren<{ testID: string; onPress: () => void }>
	>(function Button({ children, testID, onPress }, ref) {
		return (
			<button ref={ref} data-testid={testID} onClick={onPress}>
				{children}
			</button>
		);
	}),
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<div data-testid={testID}>{children}</div>
	),
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
	TextClassContext: React.createContext(undefined),
}));
jest.mock('@wcpos/components/icon', () => ({
	Icon: ({ name }: { name: string }) => <span data-testid={name} />,
}));
jest.mock('../../components/product/variable-product-row', () => ({
	VariableProductRow: () => <div data-testid="inline-row" />,
}));
jest.mock('../../components/data-table/rows', () => ({
	DataTableRow: ({ onPress, trailing }: { onPress: () => void; trailing: React.ReactNode }) => (
		<button data-testid="drill-row" onClick={onPress}>
			{trailing}
		</button>
	),
}));
jest.mock('react-native-gesture-handler', () => ({
	GestureDetector: ({ children }: React.PropsWithChildren) => children,
	Gesture: {
		Pan: () => {
			const pan = {
				runOnJS: () => pan,
				enabled: () => pan,
				hitSlop: () => pan,
				activeOffsetX: () => pan,
				failOffsetY: () => pan,
				onEnd: () => pan,
			};
			return pan;
		},
	},
}));
const parent = {
	uuid: 'parent',
	remoteId: 12,
	payload: { name: 'Tea', variations: [1, 2] },
} as unknown as React.ComponentProps<typeof DrillIn>['parent'];
function Browser() {
	const [inside, setInside] = React.useState(true);
	return inside ? (
		<DrillIn parent={parent} back={() => setInside(false)} />
	) : (
		<div data-testid="products-list" />
	);
}
it('focuses the real breadcrumb parent on entry', () => {
	render(<Browser />);
	expect(document.activeElement).toBe(screen.getByTestId('products-breadcrumb-back'));
});
it('Back returns to products', () => {
	render(<Browser />);
	fireEvent.click(screen.getByTestId('products-breadcrumb-back'));
	expect(screen.getByTestId('products-list')).not.toBeNull();
	expect(screen.queryByTestId('products-variations-pane')).toBeNull();
});
it('as rows, keeps the breadcrumb above the pane and gives the variations no way back of their own', () => {
	render(<Browser />);
	expect(screen.queryByTestId('crumb-fades')).toBeNull();
	expect(screen.getByTestId('variations').dataset.tiles).toBe('false');
});
it('as tiles, keeps the breadcrumb a row above the grid, fading with the deal, and makes the parent tile go back', () => {
	const back = jest.fn();
	render(<DrillIn parent={parent} back={back} tiles />);
	const fades = screen.getByTestId('crumb-fades');
	expect(fades.contains(screen.getByTestId('products-breadcrumb'))).toBe(true);
	// A row, not an overlay: the crumb comes before the pane in the flow and does not contain it
	// (owner's pick A, 2026-10-05 — never inside the card, never a card of its own).
	const pane = screen.getByTestId('variations');
	expect(fades.contains(pane)).toBe(false);
	expect(fades.compareDocumentPosition(pane) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	fireEvent.click(pane);
	expect(back).toHaveBeenCalled();
});
it('Escape returns to products', () => {
	render(<Browser />);
	fireEvent.keyDown(screen.getByTestId('products-variations-pane'), { key: 'Escape' });
	expect(screen.getByTestId('products-list')).not.toBeNull();
});
it('draws the caller’s pane under the crumb instead of the POS variations', () => {
	const renderPane = jest.fn((product: { uuid: string }) => (
		<div data-testid="caller-pane">{product.uuid}</div>
	));
	render(<DrillIn parent={parent} back={jest.fn()} renderPane={renderPane} />);
	expect(screen.getByTestId('caller-pane').textContent).toBe('parent');
	expect(renderPane).toHaveBeenCalledWith(parent);
	expect(screen.queryByTestId('variations')).toBeNull();
	expect(screen.getByTestId('products-breadcrumb')).toBeTruthy();
});
it('renders the given ancestors before the product and keeps the last one as the way back', () => {
	const back = jest.fn();
	const toRoot = jest.fn();
	render(
		<DrillIn
			parent={parent}
			back={back}
			parents={[
				{ label: 'Categories', onPress: toRoot },
				{ label: 'Hot', onPress: back },
			]}
		/>
	);
	fireEvent.click(screen.getByTestId('products-breadcrumb-parent-0'));
	expect(toRoot).toHaveBeenCalled();
	expect(back).not.toHaveBeenCalled();
	fireEvent.click(screen.getByTestId('products-breadcrumb-back'));
	expect(back).toHaveBeenCalled();
	expect(screen.queryByText('pos_products.products_crumb')).toBeNull();
});
it('keeps the existing expanded row under inline and drills with a chevron otherwise', () => {
	const item = { original: { record: parent } } as unknown as React.ComponentProps<
		typeof VariableProductRow
	>['item'];
	const table = {} as unknown as React.ComponentProps<typeof VariableProductRow>['table'];
	const onDrill = jest.fn();
	const { rerender } = render(
		<VariableProductRow
			item={item}
			table={table}
			index={0}
			variationsStyle="inline"
			onDrill={onDrill}
		/>
	);
	expect(screen.getByTestId('inline-row')).not.toBeNull();
	expect(screen.queryByTestId('drill-row')).toBeNull();
	rerender(
		<VariableProductRow
			item={item}
			table={table}
			index={0}
			variationsStyle="drill"
			onDrill={onDrill}
		/>
	);
	expect(screen.queryByTestId('inline-row')).toBeNull();
	expect(screen.getByTestId('chevronRight')).not.toBeNull();
	fireEvent.click(screen.getByTestId('drill-row'));
	expect(onDrill).toHaveBeenCalledWith(parent);
});

it('mounts a fresh variations pane for another product, never the previous one’s instance', () => {
	// The PaneStack reuses its detail across a pop and a tap on another product mid-slide: a
	// reused pane would draw the first product's rows under the second one's crumb.
	mockPaneMounts.length = 0;
	const other = {
		uuid: 'other',
		remoteId: 13,
		payload: { name: 'Coffee', variations: [3] },
	} as unknown as React.ComponentProps<typeof DrillIn>['parent'];
	const { rerender } = render(<DrillIn parent={parent} back={jest.fn()} />);
	rerender(<DrillIn parent={parent} back={jest.fn()} />);
	expect(mockPaneMounts).toEqual(['parent']);
	rerender(<DrillIn parent={other} back={jest.fn()} />);
	expect(mockPaneMounts).toEqual(['parent', 'other']);
});
