/* eslint-disable import/first, @typescript-eslint/no-require-imports */
const mockPendingTransitions: (() => void)[] = [];
const mockPlatform = { OS: 'ios' };
const mockGestureHandlerScrollView = jest.fn();

jest.mock('react', () => {
	const actual = jest.requireActual('react');
	return {
		...actual,
		useTransition: () => [false, (callback: () => void) => mockPendingTransitions.push(callback)],
	};
});

import { fireEvent, render, screen } from '@testing-library/react';

import { TreeCombobox, TreeComboboxContent, TreeComboboxTrigger } from './tree-combobox';

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

jest.mock('@rn-primitives/popover', () => {
	const React = require('react');
	return {
		Root: ({ children }: any) => <>{children}</>,
		Trigger: ({ children, onLayout: _onLayout, ...props }: any) => (
			<button {...props}>{children}</button>
		),
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
			<div data-testid="tree-combobox-content" data-classname={className} style={style} {...props}>
				{children}
			</div>
		),
		useRootContext: () => ({ onOpenChange: jest.fn() }),
	};
});

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
		<div data-testid="tree-combobox-list-root" style={{ flex: 1 }} {...props}>
			{children}
		</div>
	),
	List: ({ data, renderItem, parentProps, renderScrollComponent }: any) => (
		<div
			data-testid="tree-combobox-list-parent"
			data-uses-gesture-scroll-view={String(renderScrollComponent === mockGestureHandlerScrollView)}
			style={parentProps?.style}
		>
			{data.map((item: any, index: number) => (
				<div key={item.value}>{renderItem({ item, index })}</div>
			))}
		</div>
	),
	Item: ({ children }: any) => <>{children}</>,
}));

jest.mock('../checkbox', () => ({
	Checkbox: () => <span data-testid="checkbox" />,
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

describe('TreeCombobox native content', () => {
	beforeEach(() => {
		mockPendingTransitions.length = 0;
		mockPlatform.OS = 'ios';
	});

	it('keeps typed search text immediately visible while tree filtering is deferred', () => {
		render(
			<TreeCombobox options={[{ value: '1', label: 'Clothing' }]}>
				<TreeComboboxTrigger>Open</TreeComboboxTrigger>
				<TreeComboboxContent searchPlaceholder="Search categories" />
			</TreeCombobox>
		);

		const input = screen.getByLabelText('Search categories') as HTMLInputElement;
		fireEvent.change(input, { target: { value: 'shirts' } });

		expect(input.value).toBe('shirts');
		expect(mockPendingTransitions).toHaveLength(1);
	});

	it('caps the native virtualized list height for long lists', () => {
		const options = Array.from({ length: 20 }, (_, index) => ({
			value: String(index),
			label: `Category ${index}`,
		}));

		render(
			<TreeCombobox options={options} defaultExpanded="all">
				<TreeComboboxTrigger>Open</TreeComboboxTrigger>
				<TreeComboboxContent searchPlaceholder="Search categories" estimatedItemSize={36} />
			</TreeCombobox>
		);

		const listRoot = screen.getByTestId('tree-combobox-list-root');

		expect(listRoot.parentElement).toHaveStyle({ height: '236px' });
		expect(listRoot.parentElement).toHaveStyle({ maxHeight: '236px' });
		expect(listRoot).toHaveStyle({ flex: '1' });
		expect(screen.getByTestId('tree-combobox-list-parent')).toHaveStyle({ height: '100%' });
	});

	it('uses the gesture-handler scroll view for Android popover lists', () => {
		mockPlatform.OS = 'android';

		render(
			<TreeCombobox options={[{ value: '1', label: 'Category 1' }]} defaultExpanded="all">
				<TreeComboboxTrigger>Open</TreeComboboxTrigger>
				<TreeComboboxContent searchPlaceholder="Search categories" estimatedItemSize={36} />
			</TreeCombobox>
		);

		expect(screen.getByTestId('tree-combobox-list-parent')).toHaveAttribute(
			'data-uses-gesture-scroll-view',
			'true'
		);
	});

	it('shrinks the native virtualized list height for short lists', () => {
		render(
			<TreeCombobox
				options={[
					{ value: '1', label: 'Category 1' },
					{ value: '2', label: 'Category 2' },
				]}
				defaultExpanded="all"
			>
				<TreeComboboxTrigger>Open</TreeComboboxTrigger>
				<TreeComboboxContent searchPlaceholder="Search categories" estimatedItemSize={24} />
			</TreeCombobox>
		);

		const listRoot = screen.getByTestId('tree-combobox-list-root');

		expect(listRoot.parentElement).toHaveStyle({ height: '72px' });
		expect(listRoot.parentElement).toHaveStyle({ maxHeight: '236px' });
	});
});
