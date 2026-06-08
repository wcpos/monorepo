/* eslint-disable import/first */
import * as React from 'react';

const mockPlatform = { OS: 'ios' };
const mockGestureHandlerScrollView = jest.fn();

import { fireEvent, render, screen } from '@testing-library/react';

import {
	Combobox,
	ComboboxContent,
	ComboboxInput,
	ComboboxList,
	ComboboxTrigger,
} from './combobox';

jest.mock(
	'@wcpos/utils/platform',
	() => ({
		Platform: mockPlatform,
	}),
	{ virtual: true }
);

jest.mock('react-native-gesture-handler', () => ({
	ScrollView: mockGestureHandlerScrollView,
}));

jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: {
		View: ({ children, ...props }: any) => <div {...props}>{children}</div>,
	},
	FadeIn: { duration: () => ({}) },
	FadeOut: {},
}));

jest.mock('@rn-primitives/slot', () => ({
	Slot: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}));

jest.mock('@rn-primitives/popover', () => ({
	Root: ({ children }: any) => <>{children}</>,
	Trigger: ({ children, ...props }: any) => <button {...props}>{children}</button>,
	Portal: ({ children }: any) => <>{children}</>,
	Overlay: ({ children, ...props }: any) => <div {...props}>{children}</div>,
	Content: ({
		children,
		style,
		className,
		align: _align,
		sideOffset: _sideOffset,
		...props
	}: any) => (
		<div data-testid="combobox-content" data-classname={className} style={style} {...props}>
			{children}
		</div>
	),
	useRootContext: () => ({ onOpenChange: jest.fn() }),
}));

jest.mock('../input', () => ({
	Input: ({ value, onChangeText, placeholder, ...props }: any) => (
		<input
			aria-label={placeholder}
			value={value ?? ''}
			onChange={(event) => onChangeText?.(event.currentTarget.value)}
			{...props}
		/>
	),
}));

jest.mock('../virtualized-list', () => ({
	Root: ({ children, style: _style, ...props }: any) => (
		<div data-testid="combobox-list-root" style={{ flex: 1 }} {...props}>
			{children}
		</div>
	),
	List: ({ data, renderItem, parentProps, renderScrollComponent, ListEmptyComponent }: any) => (
		<div
			data-testid="combobox-list-parent"
			data-uses-gesture-scroll-view={String(renderScrollComponent === mockGestureHandlerScrollView)}
			style={parentProps?.style}
		>
			{data.length === 0 && ListEmptyComponent ? (
				<ListEmptyComponent />
			) : (
				data.map((item: any, index: number) => (
					<div key={item.value}>{renderItem({ item, index })}</div>
				))
			)}
		</div>
	),
	Item: ({ children }: any) => <>{children}</>,
	useItemContext: jest.fn(),
}));

jest.mock('../icon', () => ({
	Icon: ({ name }: any) => <span>{name}</span>,
}));

jest.mock('../text', () => ({
	Text: ({ children }: any) => <span>{children}</span>,
	TextClassContext: { Provider: ({ children }: any) => <>{children}</> },
}));

jest.mock('../lib/use-arrow-key-navigation', () => ({
	useArrowKeyNavigation: jest.fn(),
}));

describe('Combobox native content', () => {
	beforeEach(() => {
		mockPlatform.OS = 'ios';
	});

	it('caps the native virtualized list height for long lists', () => {
		const options = Array.from({ length: 20 }, (_, index) => ({
			value: String(index),
			label: `Option ${index}`,
		}));

		render(
			<Combobox>
				<ComboboxTrigger>Open</ComboboxTrigger>
				<ComboboxContent>
					<ComboboxInput placeholder="Search options" />
					<ComboboxList
						data={options}
						estimatedItemSize={36}
						renderItem={({ item }) => <span>{item.label}</span>}
					/>
				</ComboboxContent>
			</Combobox>
		);

		const listRoot = screen.getByTestId('combobox-list-root');

		expect(listRoot.parentElement).toHaveStyle({ height: '236px' });
		expect(listRoot.parentElement).toHaveStyle({ maxHeight: '236px' });
		expect(listRoot).toHaveStyle({ flex: '1' });
		expect(screen.getByTestId('combobox-list-parent')).toHaveStyle({ height: '100%' });
	});

	it('preserves native empty-state rendering when filtering removes all options', () => {
		render(
			<Combobox>
				<ComboboxTrigger>Open</ComboboxTrigger>
				<ComboboxContent>
					<ComboboxInput placeholder="Search options" />
					<ComboboxList
						data={[{ value: '1', label: 'Option 1' }]}
						estimatedItemSize={36}
						renderItem={({ item }) => <span>{item.label}</span>}
						filter={() => []}
						ListEmptyComponent={() => <span>No options</span>}
					/>
				</ComboboxContent>
			</Combobox>
		);

		fireEvent.change(screen.getByLabelText('Search options'), { target: { value: 'missing' } });

		expect(screen.getByText('No options')).toBeInTheDocument();
		expect(screen.getByTestId('combobox-list-root').parentElement).toHaveStyle({ height: '36px' });
	});

	it('uses the gesture-handler scroll view for Android popover lists', () => {
		mockPlatform.OS = 'android';

		render(
			<Combobox>
				<ComboboxTrigger>Open</ComboboxTrigger>
				<ComboboxContent>
					<ComboboxInput placeholder="Search options" />
					<ComboboxList
						data={[{ value: '1', label: 'Option 1' }]}
						estimatedItemSize={36}
						renderItem={({ item }) => <span>{item.label}</span>}
					/>
				</ComboboxContent>
			</Combobox>
		);

		expect(screen.getByTestId('combobox-list-parent')).toHaveAttribute(
			'data-uses-gesture-scroll-view',
			'true'
		);
	});

	it('shrinks the native virtualized list height for short lists', () => {
		render(
			<Combobox>
				<ComboboxTrigger>Open</ComboboxTrigger>
				<ComboboxContent>
					<ComboboxInput placeholder="Search options" />
					<ComboboxList
						data={[
							{ value: '1', label: 'Option 1' },
							{ value: '2', label: 'Option 2' },
						]}
						estimatedItemSize={24}
						renderItem={({ item }) => <span>{item.label}</span>}
					/>
				</ComboboxContent>
			</Combobox>
		);

		const listRoot = screen.getByTestId('combobox-list-root');

		expect(listRoot.parentElement).toHaveStyle({ height: '72px' });
		expect(listRoot.parentElement).toHaveStyle({ maxHeight: '236px' });
	});
});
