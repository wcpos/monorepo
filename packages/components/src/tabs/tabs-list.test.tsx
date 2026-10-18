import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { DeviceScope } from '../lib/device';
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

jest.mock(
	'uniwind',
	() => ({
		withUniwind: (Component: React.ComponentType<any>) => Component,
	}),
	{ virtual: true }
);

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
	OptionSelect: ({ onChange, options, placeholder, value }: any) => {
		const selected = options.find((option: any) => option.value === value);
		return (
			<div data-testid="tabs-select">
				<button data-testid="tabs-select-trigger">{selected?.label ?? placeholder}</button>
				{options.map((option: any) => (
					<button
						key={option.value}
						data-testid={`tabs-select-item-${option.value}`}
						onClick={() => onChange(option.value, option)}
					>
						{option.label}
					</button>
				))}
				<button data-testid="tabs-select-clear" onClick={() => onChange(undefined, undefined)} />
			</div>
		);
	},
}));

describe('TabsList', () => {
	const renderAsSelect = (phone: boolean, onValueChange = jest.fn()) =>
		render(
			<DeviceScope phone={phone}>
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
			</DeviceScope>
		);

	it('renders only the select on a phone, built from the trigger labels', () => {
		const onValueChange = jest.fn();
		renderAsSelect(true, onValueChange);

		expect(screen.getByTestId('tabs-select')).toBeInTheDocument();
		expect(screen.queryByTestId('tabs-list')).not.toBeInTheDocument();
		expect(screen.getByTestId('tabs-select-trigger')).toHaveTextContent('General Settings');
		expect(screen.getByTestId('tabs-select-item-tax')).toHaveTextContent('Tax Settings');

		screen.getByTestId('tabs-select-clear').click();
		expect(onValueChange).not.toHaveBeenCalled();
	});

	it('renders only the plain list off a phone, with no breakpoint classes', () => {
		renderAsSelect(false);

		expect(screen.queryByTestId('tabs-select')).not.toBeInTheDocument();
		expect(screen.getByTestId('tabs-list')).toBeInTheDocument();
		expect(screen.getByTestId('tabs-list').className).not.toMatch(/sm:|hidden/);
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
