import * as React from 'react';

import { useT } from '../../../../contexts/translations';
import { DataTableFooter } from '../../components/data-table/footer';
import { TaxBasedOn } from '../../components/product/tax-based-on';
import { useTaxSettings } from '../../contexts/tax-rates';

import type { DataTableFooterProps } from '../../components/data-table/footer';

/** The footer contract every table footer takes (`DataTableFooterProps`): values only. */
export type ProductsFooterProps = Omit<DataTableFooterProps, 'children'> & {
	prefix?: string;
};

/**
 * A pane's own numbers for its DataTable's footer (a level's or a variations pane's rows; total
 * undefined: the table's), as a context so the footer is ONE component, never remounted mid-sync.
 */
export type OwnFooterNumbers = { drawnCount: number; total?: number | null; prefix?: string };
export const OwnFooterContext = React.createContext<OwnFooterNumbers | null>(null);

/** The products caption row: the table footer with the products' sentence; the tax notice its caption. */
export function ProductsFooter({ label, prefix: propsPrefix, ...props }: ProductsFooterProps) {
	const own = React.useContext(OwnFooterContext);
	const { calcTaxes } = useTaxSettings();
	const t = useT();
	const drawnCount = own?.drawnCount ?? props.drawnCount;
	const total = own?.total === undefined ? props.total : own.total;
	const prefix = own ? own.prefix : propsPrefix;
	const withPrefix = (products: string) =>
		prefix === undefined ? products : t('pos_products.root_tally', { terms: prefix, products });
	return (
		<DataTableFooter
			{...props}
			drawnCount={drawnCount}
			total={total}
			label={
				label ??
				withPrefix(
					total === null
						? t('common.showing_n', { shown: drawnCount.toLocaleString() })
						: drawnCount < total
							? t('common.showing_of', {
									shown: drawnCount.toLocaleString(),
									total: total.toLocaleString(),
								})
							: props.collectionName === 'variations'
								? t('pos_products.n_options', { count: total })
								: t('pos_products.n_products', { count: total })
				)
			}
		>
			{calcTaxes ? <TaxBasedOn /> : null}
		</DataTableFooter>
	);
}
