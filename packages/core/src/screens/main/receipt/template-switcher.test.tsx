/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import type { TemplateDocument } from '@wcpos/database';

import { TemplateSwitcher } from './template-switcher';

jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/components/select', () => {
	const Pass = ({ children }: React.PropsWithChildren) => children;
	return {
		Select: Pass,
		SelectContent: Pass,
		SelectGroup: Pass,
		SelectTrigger: Pass,
		SelectValue: () => null,
		SelectItem: ({
			testID,
			className,
			label,
			disabled,
		}: {
			testID: string;
			className?: string;
			label: string;
			disabled?: boolean;
		}) => (
			<button data-testid={testID} className={className} disabled={disabled}>
				{label}
			</button>
		),
	};
});

// Revert: leave SelectItem at its shared ~32pt default instead of supplying a 48pt target.
it('gives every template option a 48pt minimum, including disabled offline options', () => {
	render(
		<TemplateSwitcher
			templates={
				[
					{ id: 1, title: 'Thermal', offline_capable: true },
					{ id: 2, title: 'Server', offline_capable: false },
				] as TemplateDocument[]
			}
			selectedId={1}
			onSelect={jest.fn()}
			isOffline
		/>
	);
	for (const id of [1, 2]) {
		expect(screen.getByTestId(`receipt-template-${id}`).className).toContain('min-h-12');
	}
	expect((screen.getByTestId('receipt-template-2') as HTMLButtonElement).disabled).toBe(true);
});
