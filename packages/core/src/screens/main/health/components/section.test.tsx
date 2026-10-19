/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { Section } from './section';

type Props = { children?: React.ReactNode; testID?: string };
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children, testID }: Props) => (
		<div data-testid={testID} data-stack="row">
			{children}
		</div>
	),
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children, testID }: Props) => (
		<div data-testid={testID} data-stack="column">
			{children}
		</div>
	),
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: Props) => <span data-testid={testID}>{children}</span>,
}));
jest.mock('@wcpos/components/lib/utils', () => ({
	cn: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
}));

it('renders the title, the sub and the action, with the action in the header row', () => {
	render(
		<Section
			title="Registers"
			sub="Receipt numbering on each till"
			action={<button type="button" data-testid="section-action" />}
			testID="section"
		>
			<span data-testid="section-body" />
		</Section>
	);
	const section = screen.getByTestId('section');
	expect(section.textContent).toContain('Registers');
	expect(section.textContent).toContain('Receipt numbering on each till');

	const headerRow = screen.getByTestId('section-action').closest('[data-stack="row"]');
	expect(headerRow).not.toBeNull();
	expect(headerRow?.textContent).toContain('Registers');
	expect(headerRow?.textContent).toContain('Receipt numbering on each till');
	// The body sits under the header row, not in it.
	expect(headerRow?.contains(screen.getByTestId('section-body'))).toBe(false);
});

it('renders without a sub or an action', () => {
	render(
		<Section title="Registers" testID="section">
			<span />
		</Section>
	);
	expect(screen.getByTestId('section').textContent).toBe('Registers');
});
