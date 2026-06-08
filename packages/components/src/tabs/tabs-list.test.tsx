import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { Tabs, TabsList, TabsTrigger } from './index';

const TabsContext = React.createContext({
	value: 'general',
	onValueChange: (_value: string) => undefined,
});

jest.mock('@rn-primitives/tabs', () => ({
	Root: ({ children, value, onValueChange }: any) => (
		<TabsContext.Provider value={{ value, onValueChange }}>
			<div data-testid="tabs-root">{children}</div>
		</TabsContext.Provider>
	),
	List: ({ children, className, ...props }: any) => (
		<div className={className} data-testid="tabs-list" {...props}>
			{children}
		</div>
	),
	Trigger: ({ children, className, onPress, value, ...props }: any) => (
		<button className={className} onClick={onPress} value={value} {...props}>
			{children}
		</button>
	),
	Content: ({ children, className, value, ...props }: any) => (
		<div className={className} data-value={value} {...props}>
			{children}
		</div>
	),
	useRootContext: () => React.useContext(TabsContext),
}));

jest.mock('expo-haptics', () => ({
	ImpactFeedbackStyle: { Light: 'light' },
	impactAsync: jest.fn(),
}));

jest.mock('uniwind', () => ({
	withUniwind: (Component: React.ComponentType<any>) => Component,
}));

jest.mock('../hstack', () => ({
	HStack: ({ children, className }: any) => <div className={className}>{children}</div>,
}));

jest.mock('../icon-button', () => ({
	IconButton: ({ disabled, name, onPress }: any) => (
		<button disabled={disabled} onClick={onPress}>
			{name}
		</button>
	),
}));

jest.mock('../text', () => ({
	TextClassContext: React.createContext(''),
	Text: ({ children }: any) => <span>{children}</span>,
}));

jest.mock('../select', () => ({
	Select: ({ children, onValueChange }: any) => (
		<div data-testid="tabs-select" data-on-value-change={Boolean(onValueChange)}>
			{children}
		</div>
	),
	SelectContent: ({ children }: any) => <div data-testid="tabs-select-content">{children}</div>,
	SelectItem: ({ label, value }: any) => (
		<button data-testid={`tabs-select-item-${value}`} value={value}>
			{label}
		</button>
	),
	SelectTrigger: ({ children }: any) => (
		<button data-testid="tabs-select-trigger">{children}</button>
	),
	SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
}));

describe('TabsList', () => {
	it('renders a mobile select from tab trigger labels when asSelect is enabled', () => {
		const onValueChange = jest.fn();

		render(
			<Tabs value="general" onValueChange={onValueChange}>
				<TabsList asSelect className="w-full flex-row">
					<TabsTrigger value="general" label="General Settings">
						General Settings
					</TabsTrigger>
					<TabsTrigger value="tax" label="Tax Settings">
						Tax Settings
					</TabsTrigger>
				</TabsList>
			</Tabs>
		);

		expect(screen.getByTestId('tabs-select')).toBeInTheDocument();
		expect(screen.getByTestId('tabs-list')).toHaveClass('hidden', 'sm:inline-flex');
		expect(screen.getByTestId('tabs-select-trigger')).toHaveTextContent('General Settings');
		expect(screen.getByTestId('tabs-select-item-tax')).toHaveTextContent('Tax Settings');
	});

	it('keeps the regular tab list when asSelect is omitted', () => {
		render(
			<Tabs value="general" onValueChange={jest.fn()}>
				<TabsList>
					<TabsTrigger value="general">General Settings</TabsTrigger>
				</TabsList>
			</Tabs>
		);

		expect(screen.queryByTestId('tabs-select')).not.toBeInTheDocument();
		expect(screen.getByTestId('tabs-list')).not.toHaveClass('hidden');
	});
});
