import * as React from 'react';
import {
	useObservableState,
	useObservableSuspense,
	useObservablePickState,
} from 'observable-hooks';
import filter from 'lodash/filter';
import parseInt from 'lodash/parseInt';
import Text from '@wcpos/components/src/text';
import useCurrencyFormat from '@wcpos/hooks/src/use-currency-format';
import useTaxes from '@wcpos/hooks/src/use-taxes';
import useAppState from '@wcpos/hooks/src/use-app-state';
import { calcTaxes, sumTaxes } from './utils';

type PriceProps = {
	item: import('@wcpos/database').ProductDocument;
};

const Price = ({ item: product }: PriceProps) => {
	const { format } = useCurrencyFormat();
	const price = useObservableState(product.price$, product.price);
	const { resource } = useTaxes();
	const taxRates = useObservableSuspense(resource);
	const { store } = useAppState();
	const {
		default_country,
		store_postcode,
		calc_taxes,
		prices_include_tax,
		tax_round_at_subtotal,
		tax_display_shop,
	} = useObservablePickState(
		store.$,
		() => ({
			default_country: store?.default_country,
			store_postcode: store?.store_postcode,
			calc_taxes: store?.calc_taxes,
			prices_include_tax: store?.prices_include_tax,
			tax_round_at_subtotal: store?.tax_round_at_subtotal,
			tax_display_shop: store?.tax_display_shop,
		}),
		'default_country',
		'store_postcode',
		'calc_taxes',
		'prices_include_tax',
		'tax_round_at_subtotal',
		'tax_display_shop'
	);

	const priceMaybeWithTax = React.useMemo(() => {
		if (calc_taxes === 'yes' && taxRates && taxRates.length > 0) {
			const taxClass = product.tax_class === '' ? 'standard' : product.tax_class;
			const docs = filter(taxRates, { class: taxClass, country: default_country });

			if (docs && docs.length > 0) {
				const rates = docs.map((rate) => rate.toJSON());
				const priceNum = parseInt(price || '0');
				const taxes = calcTaxes(priceNum, rates, prices_include_tax === 'yes');
				return priceNum + sumTaxes(taxes);
			}
		}

		return price;
	}, [calc_taxes, default_country, price, prices_include_tax, product.tax_class, taxRates]);

	return product.isSynced() ? (
		<Text>{format(priceMaybeWithTax || 0)}</Text>
	) : (
		<Text.Skeleton length="short" />
	);
};

export default Price;
