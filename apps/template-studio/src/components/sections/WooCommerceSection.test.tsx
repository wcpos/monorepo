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
				emitEscPrintMode={true}
				fullReceiptRaster={false}
				onChangePath={onChangePath}
				onPrinterModelChange={vi.fn()}
				onLanguageChange={vi.fn()}
				onThermalColumnsChange={vi.fn()}
				onEmitEscPrintModeChange={vi.fn()}
				onFullReceiptRasterChange={vi.fn()}
			/>
		);

		fireEvent.change(screen.getByLabelText('Currency'), {
			target: { value: 'EUR' },
		});

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
				emitEscPrintMode={true}
				fullReceiptRaster={false}
				onChangePath={vi.fn()}
				onPrinterModelChange={vi.fn()}
				onLanguageChange={vi.fn()}
				onThermalColumnsChange={onThermalColumnsChange}
				onEmitEscPrintModeChange={vi.fn()}
				onFullReceiptRasterChange={vi.fn()}
			/>
		);

		const select = screen.getByLabelText('Characters per line');
		expect(select).toHaveValue('42');
		expect(screen.getByRole('option', { name: '80mm standard (42 chars)' })).toBeInTheDocument();
		expect(screen.getByRole('option', { name: '80mm wide (48 chars)' })).toBeInTheDocument();
		expect(screen.getByRole('option', { name: '58mm (32 chars)' })).toBeInTheDocument();
		expect(screen.getByText(/Matches the POS printer profile text width/)).toBeInTheDocument();
		fireEvent.change(select, { target: { value: '48' } });
		expect(onThermalColumnsChange).toHaveBeenCalledWith(48);
	});

	it('wires the wide-compatibility toggle by template engine', () => {
		const onEmitEscPrintModeChange = vi.fn();
		const props = {
			currency: 'EUR',
			locale: 'es_ES',
			displayTax: 'incl',
			pricesEnteredWithTax: true,
			roundingMode: 'per-line',
			printerModel: 'generic',
			language: 'esc-pos',
			thermalColumns: 42 as const,
			emitEscPrintMode: true,
			fullReceiptRaster: false,
			onChangePath: vi.fn(),
			onPrinterModelChange: vi.fn(),
			onLanguageChange: vi.fn(),
			onThermalColumnsChange: vi.fn(),
			onEmitEscPrintModeChange,
			onFullReceiptRasterChange: vi.fn(),
		};
		const { rerender } = render(<WooCommerceSection {...props} engine="thermal" />);

		const toggle = screen.getByLabelText('Wide compatibility');
		expect(toggle).toBeEnabled();
		fireEvent.click(toggle);
		expect(onEmitEscPrintModeChange).toHaveBeenCalledWith(false);

		rerender(<WooCommerceSection {...props} engine="logicless" />);
		expect(screen.getByLabelText('Wide compatibility')).toBeDisabled();
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
				emitEscPrintMode={true}
				fullReceiptRaster={false}
				onChangePath={vi.fn()}
				onPrinterModelChange={vi.fn()}
				onLanguageChange={vi.fn()}
				onThermalColumnsChange={vi.fn()}
				onEmitEscPrintModeChange={vi.fn()}
				onFullReceiptRasterChange={vi.fn()}
			/>
		);

		expect(screen.getByLabelText('Characters per line')).toBeDisabled();
	});

	it('enables full receipt raster mode for thermal templates', () => {
		const onFullReceiptRasterChange = vi.fn();
		render(
			<WooCommerceSection
				engine="thermal"
				currency="SAR"
				locale="ar_SA"
				displayTax="incl"
				pricesEnteredWithTax={true}
				roundingMode="per-line"
				printerModel="generic"
				language="esc-pos"
				thermalColumns={42}
				emitEscPrintMode={true}
				fullReceiptRaster={false}
				onChangePath={vi.fn()}
				onPrinterModelChange={vi.fn()}
				onLanguageChange={vi.fn()}
				onThermalColumnsChange={vi.fn()}
				onEmitEscPrintModeChange={vi.fn()}
				onFullReceiptRasterChange={onFullReceiptRasterChange}
			/>
		);

		fireEvent.click(screen.getByLabelText('Full receipt raster'));

		expect(onFullReceiptRasterChange).toHaveBeenCalledWith(true);
	});
});
