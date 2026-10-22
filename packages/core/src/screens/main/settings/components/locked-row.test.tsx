/** @jest-environment jsdom */
import * as React from 'react';

import { render } from '@testing-library/react';

import { LockedRow } from './locked-row';
jest.mock('@wcpos/components/switch', () => ({
	Switch: ({
		checked,
		disabled,
		testID,
		accessibilityLabel,
	}: {
		checked: boolean;
		disabled?: boolean;
		testID: string;
		accessibilityLabel: string;
	}) => (
		<input
			type="checkbox"
			readOnly
			checked={checked}
			disabled={disabled}
			data-testid={testID}
			aria-label={accessibilityLabel}
		/>
	),
}));
jest.mock('./settings-row', () => ({
	SettingsRow: ({
		label,
		children,
		testID,
	}: React.PropsWithChildren<{ label: string; testID: string }>) => (
		<div data-testid={testID}>
			{label}
			{children}
		</div>
	),
}));
it.each(['Madrid', '', undefined])('renders a mirrored value or an em dash (%s)', (value) => {
	const { getByTestId } = render(<LockedRow label="City" value={value} testID="locked" />);
	expect(getByTestId('locked').textContent).toBe(`City${value || '—'}`);
	expect(getByTestId('locked').querySelector('input')).toBeNull();
});
it.each([true, false])('renders a mirrored boolean as a disabled switch (%s)', (value) => {
	const { getByTestId } = render(<LockedRow label="Enable taxes" value={value} testID="locked" />);
	const toggle = getByTestId('locked-switch') as HTMLInputElement;
	expect(toggle.checked).toBe(value);
	expect(toggle.disabled).toBe(true);
	expect(toggle.getAttribute('aria-label')).toBe('Enable taxes');
	expect(getByTestId('locked').textContent).toBe('Enable taxes');
});
