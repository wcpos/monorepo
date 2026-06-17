/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { DrawerEmulationWarning } from './drawer-emulation-warning';

jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
	),
}));

jest.mock('../../../../../contexts/translations', () => ({
	useT: () => (_key: string, fallback: string) => fallback,
}));

describe('DrawerEmulationWarning', () => {
	it('renders a warning when Star vendor uses ESC/POS language', () => {
		render(<DrawerEmulationWarning vendor="star" language="esc-pos" />);

		expect(screen.getByTestId('add-printer-drawer-emulation-warning')).toBeInTheDocument();
	});

	it('renders a warning when a non-Star vendor uses Star language', () => {
		render(<DrawerEmulationWarning vendor="epson" language="star-prnt" />);

		expect(screen.getByTestId('add-printer-drawer-emulation-warning')).toBeInTheDocument();
	});

	it('renders nothing when vendor and language match', () => {
		render(<DrawerEmulationWarning vendor="star" language="star-prnt" />);

		expect(screen.queryByTestId('add-printer-drawer-emulation-warning')).not.toBeInTheDocument();
	});
});
