/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen, within } from '@testing-library/react';

import { CapabilityTooltip } from './capability-tooltip';

jest.mock('@wcpos/components/tooltip', () => ({
	Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	TooltipTrigger: ({ children }: { children: React.ReactElement }) =>
		React.cloneElement(children, {
			'data-testid': 'capability-tooltip-trigger',
		} as React.HTMLAttributes<HTMLElement>),
	TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('react-native', () => ({
	View: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
		<div {...props}>{children}</div>
	),
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

describe('CapabilityTooltip', () => {
	it('uses an enabled trigger wrapper around a disabled control', () => {
		render(
			<CapabilityTooltip show hint="editProducts">
				<button type="button" disabled data-testid="disabled-control" />
			</CapabilityTooltip>
		);

		const trigger = screen.getByTestId('capability-tooltip-trigger');
		expect((trigger as HTMLButtonElement).disabled).not.toBe(true);
		expect((within(trigger).getByTestId('disabled-control') as HTMLButtonElement).disabled).toBe(
			true
		);
	});
});
