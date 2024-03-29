import * as React from 'react';

import find from 'lodash/find';
import uniq from 'lodash/uniq';

import { useTaxHelpers } from '../../contexts/tax-helpers';

export interface CalculateLineItemTaxesProps {
	total: string;
	subtotal?: string;
	taxClass?: string;
	taxStatus?: string;
}

/**
 * Tax calculation for line items and fee lines
 *
 * @TODO - if taxes not active, or taxStatus is none, we should return early?
 */
export const useTaxCalculation = () => {
	const { calculateTaxesFromPrice } = useTaxHelpers();

	/**
	 *
	 */
	const calculateLineItemTaxes = ({
		total,
		subtotal,
		taxClass,
		taxStatus,
	}: CalculateLineItemTaxesProps) => {
		const noSubtotal = subtotal === undefined;
		let subtotalTaxes = { total: 0, taxes: [] as { id: number; total: string }[] };

		if (!noSubtotal) {
			subtotalTaxes = calculateTaxesFromPrice({
				price: parseFloat(subtotal),
				taxClass,
				taxStatus,
				pricesIncludeTax: false,
			});
		}

		const totalTaxes = calculateTaxesFromPrice({
			price: parseFloat(total),
			taxClass,
			taxStatus,
			pricesIncludeTax: false,
		});

		const uniqueTaxIds = uniq([
			...subtotalTaxes.taxes.map((tax) => tax.id),
			...totalTaxes.taxes.map((tax) => tax.id),
		]);

		const taxes = uniqueTaxIds.map((id) => {
			const subtotalTax = find(subtotalTaxes.taxes, { id }) || { total: 0 };
			const totalTax = find(totalTaxes.taxes, { id }) || { total: 0 };
			return {
				id,
				subtotal: noSubtotal ? '' : String(subtotalTax.total),
				total: String(totalTax.total),
			};
		});

		const result: {
			total_tax: string;
			subtotal_tax?: string;
			taxes: { id: number; subtotal: string; total: string }[];
		} = {
			total_tax: String(totalTaxes.total),
			taxes,
		};

		if (!noSubtotal) {
			result.subtotal_tax = String(subtotalTaxes.total);
		}

		return result;
	};

	return {
		calculateLineItemTaxes,
	};
};
