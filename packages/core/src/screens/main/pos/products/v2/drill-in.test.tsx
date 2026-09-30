/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { DrillIn } from './drill-in';
import { VariableProductRow } from './rows/variable-product-row';

jest.mock('@wcpos/query', () => ({
	useDocField: (record: object, select: (value: object) => unknown) => select(record),
}));
jest.mock('@wcpos/components/lib/device', () => ({ usePointer: () => 'fine' }));
jest.mock('@wcpos/components/lib/motion', () => ({ PANE: 280, EASE: (value: number) => value }));
jest.mock('../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('./variations-pane', () => ({ VariationsPane: () => <div data-testid="variations" /> }));
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
jest.mock('../../../components/product/variable-product-row', () => ({
	VariableProductRow: () => <div data-testid="inline-row" />,
}));
jest.mock('../../../components/data-table/v2/rows', () => ({
	DataTableRow: ({ onPress, trailing }: { onPress: () => void; trailing: React.ReactNode }) => (
		<button data-testid="drill-row" onClick={onPress}>
			{trailing}
		</button>
	),
}));
jest.mock('react-native-reanimated', () => {
	const animation = {
		duration: () => animation,
		easing: () => animation,
		reduceMotion: () => animation,
	};
	return {
		__esModule: true,
		default: { View: ({ children }: React.PropsWithChildren) => <div>{children}</div> },
		FadeIn: animation,
		FadeOut: animation,
		SlideInRight: animation,
		SlideOutLeft: animation,
		ReduceMotion: { System: 'system' },
	};
});
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
		<DrillIn parent={parent} back={() => setInside(false)} viewMode="table" />
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
it('Escape returns to products', () => {
	render(<Browser />);
	fireEvent.keyDown(screen.getByTestId('products-variations-pane'), { key: 'Escape' });
	expect(screen.getByTestId('products-list')).not.toBeNull();
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
