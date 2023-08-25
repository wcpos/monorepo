import * as React from 'react';

import find from 'lodash/find';
import uniq from 'lodash/uniq';

import { useTaxHelpers } from '../../../contexts/tax-helpers';

type LineItemDocument = import('@wcpos/database').LineItemDocument;
type FeeLineDocument = import('@wcpos/database').FeeLineDocument;

export const useTaxCalculation = (item: LineItemDocument | FeeLineDocument) => {
	const { calculateTaxesFromPrice } = useTaxHelpers();

	/**
	 *
	 */
	const calculateLineItemTaxes = React.useCallback(
		({
			total,
			subtotal,
			taxClass,
			taxStatus,
		}: {
			total: string;
			subtotal?: string;
			taxClass?: string;
			taxStatus: string;
		}) => {
			const noSubtotal = subtotal === undefined;
			let subtotalTaxes = { total: 0, taxes: [] };

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

			const result = {
				total_tax: String(totalTaxes.total),
				taxes,
			};

			if (!noSubtotal) {
				result.subtotal_tax = String(subtotalTaxes.total);
			}

			item.incrementalPatch(result);
		},
		[calculateTaxesFromPrice, item]
	);

	return {
		calculateLineItemTaxes,
	};
};
