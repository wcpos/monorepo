import * as React from 'react';

import { ProductsFooter } from './footer';

/**
 * The caller's own numbers for a DataTable's footer: its own loaded count (DataTable stamps
 * `count` from the live binding's window, which is not a browse level's or a variations pane's
 * own rows), its total as a value (undefined: the footer reads the binding's `total$`), and the
 * caption under the counts.
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
export function OwnFooter(props: React.ComponentProps<typeof ProductsFooter>) {
	const { count, total, children } = React.useContext(OwnFooterContext);
	return (
		<ProductsFooter {...props} count={count} total={total}>
			{children ?? props.children}
		</ProductsFooter>
	);
}
