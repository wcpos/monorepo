/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { MismatchBadge } from './mismatch-badge';
import en from '../../../contexts/translations/locales/en/core.json';

jest.mock('@wcpos/components/text', () => {
	const { Text } = jest.requireActual('react-native');
	return { Text };
});
jest.mock('../../../contexts/translations', () => {
	const { createTestT } = jest.requireActual<typeof import('../../../../jest/translate')>(
		'../../../../jest/translate'
	);
	return { useT: () => createTestT() };
});

describe('MismatchBadge', () => {
	it('renders nothing when there is no mismatch', () => {
		const { container } = render(<MismatchBadge mismatch={null} />);
		expect(container.innerHTML).toBe('');
	});

	it('explains that the dialog prints the preview of a thermal template', () => {
		render(<MismatchBadge mismatch="thermal-template-prints-preview" />);
		expect(screen.getByTestId('receipt-printer-mismatch').textContent).toBe(
			en['receipt.mismatch_thermal_template_prints_preview']
		);
	});

	it('explains that a raw printer prints the built-in layout for an HTML template', () => {
		render(<MismatchBadge mismatch="html-template-prints-default-layout" />);
		expect(screen.getByTestId('receipt-printer-mismatch').textContent).toBe(
			en['receipt.mismatch_html_template_prints_default_layout']
		);
	});

	it('explains that a thermal-only cloud printer prints nothing for an HTML template', () => {
		render(<MismatchBadge mismatch="html-template-cloud-thermal-only" />);
		expect(screen.getByTestId('receipt-printer-mismatch').textContent).toBe(
			en['receipt.mismatch_html_template_cloud_thermal_only']
		);
	});
});
