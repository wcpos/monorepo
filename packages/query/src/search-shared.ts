import { getLogger } from '@wcpos/utils/logger';

import type { ProjectionCollection } from './projection-read';
import type { Observable } from 'rxjs';

/** The slice of a collection the search blob needs: a projection read, a change stream, and close hooks. */
export type SearchableCollection = ProjectionCollection & {
	onClose?: (() => void | Promise<unknown>)[];
	$: Observable<unknown>;
	options?: { searchFields?: string[] };
};

export const searchLogger = getLogger(['wcpos', 'query', 'search']);

/** Collapse re-answers while sync churn streams source-collection events into the blob. */
export const SEARCH_SCAN_RETHROTTLE_MS = 500;

// Folding note: every plane that matches text — the blob's row fold, the term split, the
// logs scan selector and the server's SQL — must use the ONE shared `foldSearchText` /
// `SEARCH_TOKEN_BOUNDARY` from `@wcpos/sync-core` (#1732). A plane that folds differently
// makes results appear from one path and vanish when another takes over.
