import * as React from 'react';

import { searchFieldsFor, subscribeSearchFields } from './search-fields';

import type { LegacyCollectionName } from './engine-adapter/collection-map';

/**
 * The fields a collection is searched by, as a subscription: the pinned table plus the
 * site's added meta keys, re-rendering the caller when `setSearchMetaKeys` changes them.
 * The snapshot is the memoised list `searchFieldsFor` holds, so its identity is stable
 * between changes and safe in effect dependency lists.
 */
export function useSearchFields(collection: LegacyCollectionName): readonly string[] | undefined {
	const getSnapshot = React.useCallback(() => searchFieldsFor(collection), [collection]);
	return React.useSyncExternalStore(subscribeSearchFields, getSnapshot, getSnapshot);
}
