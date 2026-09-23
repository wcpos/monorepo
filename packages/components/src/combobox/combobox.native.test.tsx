/* eslint-disable import/first */
import * as fs from 'fs';
import * as path from 'path';

import * as React from 'react';
import { StyleSheet, type ViewProps } from 'react-native';

const mockViews: ViewProps[] = [];
const mockAnimation = { duration: jest.fn().mockReturnThis(), easing: jest.fn().mockReturnThis() };
const mockPlatform = { OS: 'ios' };
const mockGestureHandlerScrollView = jest.fn();

import { fireEvent, render, screen } from '@testing-library/react';

import { DeviceScope } from '../lib/device';
import {
	Combobox,
	ComboboxContent,
	ComboboxInput,
	ComboboxList,
	ComboboxTrigger,
	ComboboxValue,
} from './combobox';

jest.mock(
	'@wcpos/utils/platform',
	() => ({
		Platform: mockPlatform,
	}),
	{ virtual: true }
);

// These existing tests exercise the anchored popover, not the phone sheet.
jest.mock('react-native', () => {
	const actual = jest.requireActual('react-native');
	return {
		...actual,
		Platform: { ...actual.Platform, OS: 'ios' },
		// The sheet moves native accessibility focus into itself on mount; RN-web has no node handles.
		findNodeHandle: () => 1,
		AccessibilityInfo: { ...actual.AccessibilityInfo, setAccessibilityFocus: jest.fn() },
		View: (props: ViewProps) => {
			mockViews.push(props);
			return <actual.View {...props} />;
		},
		useWindowDimensions: () => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }),
	};
});
jest.mock('../keyboard-controller', () => ({
	KeyboardAvoidingView: jest.requireMock('react-native').View,
}));

jest.mock('react-native-gesture-handler', () => ({
	ScrollView: mockGestureHandlerScrollView,
}));

// Native-only package with untransformed Flow syntax; the combobox reads the insets
// context and tolerates a null value (no provider).
jest.mock('react-native-safe-area-context', () => ({
	SafeAreaInsetsContext: React.createContext(null),
	useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('react-native-reanimated', () => ({
	Easing: { bezier: () => (value: number) => value },
	__esModule: true,
	default: {
		View: ({ children, ...props }: any) => <div {...props}>{children}</div>,
		createAnimatedComponent: (component: React.ComponentType) => component,
	},
	...Object.fromEntries(
		'FadeIn FadeOut SlideInLeft SlideOutLeft SlideInRight SlideOutRight SlideInDown SlideOutDown'
			.split(' ')
			.map((name) => [name, mockAnimation])
	),
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
	useRootContext: () => ({ open: true, onOpenChange: jest.fn() }),
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

// Mirrors the real Text, `decodeHtml` included — a mock that swallowed the prop
// would make the entity test below unfailable.
jest.mock('../text', () => {
	const { decode } = jest.requireActual('html-entities');
	return {
		Text: ({ children, decodeHtml }: any) => (
			<span>{decodeHtml && typeof children === 'string' ? decode(children) : children}</span>
		),
		TextClassContext: { Provider: ({ children }: any) => <>{children}</> },
	};
});

jest.mock('../lib/use-arrow-key-navigation', () => ({
	useArrowKeyNavigation: jest.fn(),
}));

describe('Combobox native content', () => {
	beforeEach(() => {
		mockPlatform.OS = 'ios';
		mockViews.length = 0;
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

/**
 * ComboboxItemText has always decoded the option label, so a category named
 * "Men&#039;s" read correctly in the open list — and then reverted to the raw
 * entity in the closed trigger, which renders the SAME label through
 * ComboboxValue. One widget, one string, two spellings.
 */
describe('ComboboxValue', () => {
	it('decodes the selected label, matching the list it was chosen from', () => {
		render(
			<Combobox value={{ value: '12', label: 'Men&#039;s Shirts &amp; Ties' }}>
				<ComboboxTrigger>
					<ComboboxValue placeholder="Select a category" />
				</ComboboxTrigger>
			</Combobox>
		);

		expect(screen.getByText("Men's Shirts & Ties")).not.toBeNull();
		expect(screen.queryByText('Men&#039;s Shirts &amp; Ties')).toBeNull();
	});

	// Raised in review on #1573: a combobox whose label IS an opaque identifier —
	// a meta_data key the merchant typed — must not have it prettified, at EITHER
	// end. The switch is deliberately one flag for both halves, since decoding one
	// and not the other is the bug the flag exists to avoid.
	it('leaves the label alone when the caller opts out with decodeLabels={false}', () => {
		render(
			<Combobox decodeLabels={false} value={{ value: 'k', label: 'shipping&copy;' }}>
				<ComboboxTrigger>
					<ComboboxValue placeholder="Select a key" />
				</ComboboxTrigger>
			</Combobox>
		);

		expect(screen.getByText('shipping&copy;')).not.toBeNull();
		expect(screen.queryByText('shipping©')).toBeNull();
	});

	it('still renders the placeholder when nothing is selected', () => {
		render(
			<Combobox>
				<ComboboxTrigger>
					<ComboboxValue placeholder="Select a category" />
				</ComboboxTrigger>
			</Combobox>
		);

		expect(screen.getByText('Select a category')).not.toBeNull();
	});
});

/**
 * A class assertion has to read the source: `react-native` is mapped to
 * `react-native-web` here, whose `View` drops `className` before it reaches the
 * DOM (the probe rendered `class=""`), so the tree cannot be asked for it.
 */
describe('Combobox control height', () => {
	const source = fs.readFileSync(path.join(__dirname, 'combobox.tsx'), 'utf8');

	// The box the merchant presses is `ComboboxValue` — `ComboboxTrigger` is the
	// bare popover trigger and carries no height. It is one control tall from the
	// floored scale token, not a literal 40 px (roadmap#357).
	it('sizes the trigger box on the control token, not h-10', () => {
		expect(source).toContain('h-ctl');
		expect(source).not.toContain('h-10');
		expect(source).toContain('rounded-lg');
	});
});

it('renders the phone sheet as a View with phone metrics, not primitive Content', () => {
	render(
		<DeviceScope phone>
			<Combobox>
				<ComboboxContent inline testID="phone-panel" />
			</Combobox>
		</DeviceScope>
	);
	expect(screen.queryByTestId('combobox-content')).toBeNull();
	const panel = mockViews.find((p) => p.testID === 'phone-panel');
	expect(
		jest.requireMock('react-native').AccessibilityInfo.setAccessibilityFocus
	).toHaveBeenCalledWith(1);
	expect(panel?.className).toContain('rounded-t-2xl');
	expect(StyleSheet.flatten(panel?.style)).toMatchObject({ maxHeight: 538 });
	// The shell pads the safe area; the panel must not add the inset a second time.
	expect(StyleSheet.flatten(panel?.style)).not.toHaveProperty('paddingBottom');
});
it('keeps the native anchored wrapper full-bleed and box-none', () => {
	mockViews.length = 0;
	render(
		<Combobox>
			<ComboboxContent inline />
		</Combobox>
	);
	expect(mockViews).toContainEqual(
		expect.objectContaining({ style: StyleSheet.absoluteFill, pointerEvents: 'box-none' })
	);
});
