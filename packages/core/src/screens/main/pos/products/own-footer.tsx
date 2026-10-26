import * as React from 'react';

import { ProductsFooter, type ProductsFooterProps } from './footer';

/**
 * The caller's own numbers for a DataTable's footer: its own loaded count (DataTable stamps
 * `drawnCount` from the drawn handle's rows, which are not a browse level's or a variations pane's
 * own rows), and its total (undefined: the table's, the drawn handle's `total`).
 */
export type OwnFooterNumbers = {
	drawnCount: number;
	total?: number | null;
	prefix?: string;
};

export const OwnFooterContext = React.createContext<OwnFooterNumbers>({ drawnCount: 0 });

/**
 * A ProductsFooter whose numbers come from `OwnFooterContext`, so the component handed to
 * DataTable's `TableFooterComponent` is ONE identity for the life of the module. A component
 * made per render, or per count, is a new element type each time: React remounts the footer —
 * and its sync button, mid-sync — on every page.
 */
export function OwnFooter(props: ProductsFooterProps) {
	const { drawnCount, total, prefix } = React.useContext(OwnFooterContext);
	return (
		<ProductsFooter
			{...props}
			drawnCount={drawnCount}
			prefix={prefix}
			total={total === undefined ? props.total : total}
		/>
	);
}
