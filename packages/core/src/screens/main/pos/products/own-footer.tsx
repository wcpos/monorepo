import * as React from 'react';

import { ProductsFooter, type ProductsFooterProps } from './footer';

/**
 * The caller's own numbers for a DataTable's footer: its own loaded count (DataTable stamps
 * `count` from the drawn handle's rows, which are not a browse level's or a variations pane's
 * own rows), its total (undefined: the table's, the drawn handle's `total`), and the caption
 * under the counts.
 */
export type OwnFooterNumbers = {
	count: number;
	total?: number | null;
	children?: React.ReactNode;
};

export const OwnFooterContext = React.createContext<OwnFooterNumbers>({ count: 0 });

/**
 * A ProductsFooter whose numbers come from `OwnFooterContext`, so the component handed to
 * DataTable's `TableFooterComponent` is ONE identity for the life of the module. A component
 * made per render, or per count, is a new element type each time: React remounts the footer —
 * and its sync button, mid-sync — on every page.
 */
export function OwnFooter(props: ProductsFooterProps) {
	const { count, total, children } = React.useContext(OwnFooterContext);
	return (
		<ProductsFooter {...props} count={count} total={total === undefined ? props.total : total}>
			{children ?? props.children}
		</ProductsFooter>
	);
}
