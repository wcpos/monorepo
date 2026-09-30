/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';

import { LockedRow } from './locked-row';

const mockRow = jest.fn();
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('./settings-row', () => ({
	SettingsRow: (props: React.PropsWithChildren<{ testID?: string; label: string }>) => {
		mockRow(props);
		return (
			<div data-testid={props.testID}>
				<label>{props.label}</label>
				{props.children}
			</div>
		);
	},
}));

describe('LockedRow', () => {
	it('shows the mirrored value as text on an inline row, not as a control', () => {
		render(
			<LockedRow label="Store Base City" value="London" testID="settings-general-locked-city" />
		);

		expect(screen.getByTestId('settings-general-locked-city')).toHaveTextContent(
			'Store Base CityLondon'
		);
		expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
		expect(mockRow).toHaveBeenCalledWith(
			expect.objectContaining({ inline: true, label: 'Store Base City' })
		);
		// A locked row never writes, so it carries no Saved mark.
		expect(mockRow.mock.calls[0][0]).not.toHaveProperty('name');
	});
});
