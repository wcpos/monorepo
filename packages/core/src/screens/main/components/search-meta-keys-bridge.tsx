import * as React from 'react';

import { type SearchMetaKeys, setSearchMetaKeys, useDocField } from '@wcpos/query';

import { useAppState } from '../../../contexts/app-state';

/**
 * Hands the active site's `search_meta_keys` (the meta keys the store added to search
 * through the plugin's `woocommerce_pos_search_fields` filter, published by `wcpos/v2/site`
 * and stored on the sites row at connect) to the query layer, so the till folds the same
 * custom fields into its local search that the server matches (#2411). Mounted beside the
 * other engine bridges, inside the QueryProvider. A change takes effect for bindings created
 * after it — in practice the next screen mount, since the row only changes at connect.
 */
export function SearchMetaKeysBridge() {
	const { site } = useAppState();
	const keys = useDocField(site, (value) => value.search_meta_keys) as SearchMetaKeys | undefined;
	React.useEffect(() => {
		setSearchMetaKeys(keys);
		return () => setSearchMetaKeys(undefined);
	}, [keys]);
	return null;
}
