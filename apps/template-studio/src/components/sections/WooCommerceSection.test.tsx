import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WooCommerceSection } from './WooCommerceSection';

describe('WooCommerceSection', () => {
	it('updates canonical order.currency when currency changes', () => {
		const onChangePath = vi.fn();
		render(
			<WooCommerceSection
				engine="logicless"
				currency="USD"
				locale="en_US"
				displayTax="incl"
				pricesEnteredWithTax={true}
				roundingMode="per-line"
				printerModel=""
				language="esc-pos"
				onChangePath={onChangePath}
				onPrinterModelChange={vi.fn()}
				onLanguageChange={vi.fn()}
			/>
		);

		fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'EUR' } });

		expect(onChangePath).toHaveBeenCalledWith(['order', 'currency'], 'EUR');
	});
});
