/** @jest-environment jsdom */
import * as React from 'react';

import { render } from '@testing-library/react';

import { LockedRow } from './locked-row';
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
