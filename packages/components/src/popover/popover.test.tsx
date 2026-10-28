import '../popover/overlay.test-utils';
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import * as C from './index';
jest.mock('@rn-primitives/popover', () =>
	jest.requireActual('../popover/overlay.test-utils').mockPrimitive()
);

// The phone-or-anchored decision and the sheet's geometry are the shell's (lib/anchored-overlay.test).
it('renders the anchored panel skin at the popover width', () => {
	render(<C.PopoverContent inline testID="panel" />);
	expect(screen.getByTestId('panel')).toHaveClass('bg-card rounded-lg w-80 web:animate-pop-in');
});
