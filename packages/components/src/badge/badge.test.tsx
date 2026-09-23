import { readFileSync } from 'node:fs';

import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { Badge } from './index';
import { Button } from '../button';
import { StatusBadge } from '../status-badge';

jest.mock('react-native', () => ({
	Platform: { OS: 'web' },
	Pressable: ({ children, testID, onPress, ...props }: any) =>
		React.createElement(
			'button',
			{ ...props, 'data-testid': testID, onClick: onPress },
			typeof children === 'function' ? children({ pressed: false }) : children
		),
	View: (props: any) => React.createElement('div', props),
	Text: ({ children, ...props }: any) => React.createElement('span', props, children),
	StyleSheet: { create: (styles: any) => styles },
}));

// Ships untransformed JSX; the real `Text` (whose class merge is what is under test) pulls
// it in for `asChild`, which nothing here uses.
jest.mock('@rn-primitives/slot', () => ({
	Slot: ({ children }: any) => children,
}));

jest.mock('expo-haptics', () => ({
	impactAsync: jest.fn(),
	ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('../hstack', () => ({
	HStack: ({ children, ...props }: any) => React.createElement('div', props, children),
}));

jest.mock('../icon', () => ({
	Icon: ({ name }: { name: string }) => React.createElement('span', null, name),
}));

jest.mock('../loader', () => ({
	Loader: () => React.createElement('span', null, 'loading'),
}));

/**
 * #1369: a badge nested in a `Button` came out with the button's hover colour on its
 * digit — blue text on a red fill in the Health rail.
 *
 * `Button` publishes its label colours through `TextClassContext`, and the `ghost`
 * variants publish a STATEFUL one (`web:group-hover:text-accent-foreground`).
 * `tailwind-merge` scopes conflicts by modifier, so a prefixed rule never collides with
 * the badge's own unprefixed colour — both survive the merge and the prefixed one wins on
 * hover. The badge must therefore reset the inherited class rather than rely on the merge.
 *
 * These assert the class list, not a rendered colour: the leak IS a surviving class, and
 * jsdom resolves no `group-hover` state to catch it any other way.
 */
describe('badge colour contract', () => {
	function textClassOf(testID: string) {
		return screen.getByTestId(testID).querySelector('span')?.getAttribute('class') ?? '';
	}

	it('keeps its own colour when nested in a ghost Button', () => {
		render(
			<Button variant="ghost" testID="host">
				<Badge count={1} variant="destructive" size="sm" />
			</Button>
		);

		const className = textClassOf('host');
		expect(className).toContain('text-destructive-foreground');
		expect(className).not.toMatch(/group-hover:text-/);
		expect(className).not.toMatch(/group-active:text-/);
	});

	it.each([
		['ghost', 'ghost'],
		['ghost-quiet', 'ghost-quiet'],
		['outline', 'outline'],
		['secondary', 'secondary'],
	] as const)('inherits no stateful text colour from the %s variant', (_label, variant) => {
		render(
			<Button variant={variant} testID="host">
				<Badge count={7} variant="destructive" size="sm" />
			</Button>
		);

		expect(textClassOf('host')).not.toMatch(/group-(hover|active):text-/);
	});

	it('applies the same reset to StatusBadge', () => {
		render(
			<Button variant="ghost" testID="host">
				<StatusBadge label="Valid" variant="success" />
			</Button>
		);

		const className = textClassOf('host');
		expect(className).toContain('text-success');
		expect(className).not.toMatch(/group-(hover|active):text-/);
	});

	it('still renders its own colour outside any Button', () => {
		render(
			<div data-testid="host">
				<Badge count={3} variant="destructive" size="sm" />
			</div>
		);

		expect(textClassOf('host')).toContain('text-destructive-foreground');
	});
});

describe('badge atoms skin', () => {
	it('uses ramp text and fixed-width bold digits for small counts', () => {
		const { container } = render(<Badge count={3} size="sm" />);
		expect(container.querySelector('span')).toHaveClass('text-2xs', 'font-bold', 'tabular-nums');
	});

	it('uses a single scaled size for the dot', () => {
		const { container } = render(<Badge dot />);
		expect(container.firstChild).toHaveClass('size-2.5');
	});

	it('contains no arbitrary text sizes or palette greys', () => {
		const source = readFileSync(`${__dirname}/index.tsx`, 'utf8');
		expect(source).not.toContain('text-[');
		expect(source).not.toContain('gray');
	});
});
