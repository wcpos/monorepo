import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { Tooltip, TooltipContent, TooltipTrigger } from './index';

/**
 * On native, tooltips are off and TooltipTrigger only forwards to its children.
 * It used to wrap them in a Pressable even when no press handler was passed — and
 * a Pressable with no handlers still claims the touch responder, so the cart's
 * "+" new-order tab (a tooltip-wrapped icon inside TabsTrigger) swallowed a tap
 * at its centre and only the edge switched orders (simulator, 2026-09-03; native
 * E2E flow 08 taps exactly that centre). The harness mocks react-native, so the
 * pin is which primitive the trigger renders through: View without handlers,
 * Pressable with them.
 */

type MockProps = { children?: React.ReactNode; testID?: string };

jest.mock('react-native', () => ({
	Platform: { OS: 'web' },
	StyleSheet: { create: (styles: unknown) => styles },
	Pressable: ({ children, testID }: MockProps) =>
		React.createElement(
			'button',
			{ 'data-testid': testID, 'data-primitive': 'Pressable' },
			children
		),
	View: ({ children, testID }: MockProps) =>
		React.createElement('div', { 'data-testid': testID, 'data-primitive': 'View' }, children),
	Text: ({ children }: MockProps) => React.createElement('span', null, children),
}));
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: { View: ({ children }: MockProps) => React.createElement('div', null, children) },
	FadeIn: { duration: () => ({}) },
	FadeOut: { duration: () => ({}) },
}));
jest.mock('@rn-primitives/tooltip', () => ({
	Root: ({ children }: MockProps) => React.createElement(React.Fragment, null, children),
	Trigger: ({ children }: MockProps) => React.createElement(React.Fragment, null, children),
	Content: ({ children }: MockProps) => React.createElement(React.Fragment, null, children),
	Portal: ({ children }: MockProps) => React.createElement(React.Fragment, null, children),
	Overlay: ({ children }: MockProps) => React.createElement(React.Fragment, null, children),
}));
jest.mock('@rn-primitives/slot', () => ({
	Slot: ({ children }: MockProps) => React.createElement(React.Fragment, null, children),
}));
jest.mock('../text', () => ({
	TextClassContext: React.createContext(''),
}));
jest.mock('../lib/utils', () => ({
	cn: (...parts: unknown[]) => parts.filter(Boolean).join(' '),
}));

describe('TooltipTrigger on native (tooltips off)', () => {
	it('renders a plain View when it has no press handlers, so a parent pressable gets the tap', () => {
		render(
			<Tooltip>
				<TooltipTrigger testID="trigger">
					<span>+</span>
				</TooltipTrigger>
				<TooltipContent>
					<span>Open a new order</span>
				</TooltipContent>
			</Tooltip>
		);
		expect(screen.getByTestId('trigger').getAttribute('data-primitive')).toBe('View');
	});

	it('renders a View when a handler prop is present but not callable', () => {
		render(
			<Tooltip>
				<TooltipTrigger testID="trigger" onPress={undefined}>
					<span>+</span>
				</TooltipTrigger>
			</Tooltip>
		);
		expect(screen.getByTestId('trigger').getAttribute('data-primitive')).toBe('View');
	});

	it('still wraps in a Pressable for hover handlers, which only Pressable implements', () => {
		render(
			<Tooltip>
				<TooltipTrigger testID="trigger" onHoverIn={() => undefined}>
					<span>?</span>
				</TooltipTrigger>
			</Tooltip>
		);
		expect(screen.getByTestId('trigger').getAttribute('data-primitive')).toBe('Pressable');
	});

	it('still wraps in a Pressable when the caller passes press handlers', () => {
		render(
			<Tooltip>
				<TooltipTrigger testID="trigger" onPress={() => undefined}>
					<span>?</span>
				</TooltipTrigger>
			</Tooltip>
		);
		expect(screen.getByTestId('trigger').getAttribute('data-primitive')).toBe('Pressable');
	});
});
