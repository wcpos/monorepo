import '../popover/overlay.test-utils';
import { readFileSync } from 'node:fs';

import * as React from 'react';

import { render, screen } from '@testing-library/react';

import * as C from './index';
jest.mock('@rn-primitives/hover-card', () =>
	jest.requireActual('../popover/overlay.test-utils').mockPrimitive()
);

it('renders the anchored panel skin', () => {
	render(<C.HoverCardContent inline testID="panel" />);
	expect(screen.getByTestId('panel')).toHaveClass('bg-card rounded-lg w-64 web:animate-pop-in');
	expect(readFileSync(`${__dirname}/index.tsx`, 'utf8')).not.toMatch(/Platform|bg-popover/);
});
