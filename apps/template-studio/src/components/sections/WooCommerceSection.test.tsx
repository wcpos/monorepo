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
				thermalColumns={42}
				onChangePath={onChangePath}
				onPrinterModelChange={vi.fn()}
				onLanguageChange={vi.fn()}
				onThermalColumnsChange={vi.fn()}
			/>
		);

		fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'EUR' } });

		expect(onChangePath).toHaveBeenCalledWith(['order', 'currency'], 'EUR');
	});
	it('enables characters-per-line selection for thermal templates', () => {
		const onThermalColumnsChange = vi.fn();
		render(
			<WooCommerceSection
				engine="thermal"
				currency="EUR"
				locale="es_ES"
				displayTax="incl"
				pricesEnteredWithTax={true}
				roundingMode="per-line"
				printerModel="generic"
				language="esc-pos"
				thermalColumns={42}
				onChangePath={vi.fn()}
				onPrinterModelChange={vi.fn()}
				onLanguageChange={vi.fn()}
				onThermalColumnsChange={onThermalColumnsChange}
			/>
		);

		const select = screen.getByLabelText('Characters per line');
		expect(select).toHaveValue('42');
		fireEvent.change(select, { target: { value: '48' } });
		expect(onThermalColumnsChange).toHaveBeenCalledWith(48);
	});

	it('disables characters-per-line selection for logicless templates', () => {
		render(
			<WooCommerceSection
				engine="logicless"
				currency="EUR"
				locale="es_ES"
				displayTax="incl"
				pricesEnteredWithTax={true}
				roundingMode="per-line"
				printerModel="generic"
				language="esc-pos"
				thermalColumns={42}
				onChangePath={vi.fn()}
				onPrinterModelChange={vi.fn()}
				onLanguageChange={vi.fn()}
				onThermalColumnsChange={vi.fn()}
			/>
		);

		expect(screen.getByLabelText('Characters per line')).toBeDisabled();
	});
});
