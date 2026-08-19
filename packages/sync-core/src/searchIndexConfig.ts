/**
 * Local search-index tuning, shared by every side that has to agree on it:
 *
 *  - `@wcpos/database` configures the FlexSearch index with it (`minlength`)
 *  - `@wcpos/query` short-circuits a local search below it
 *  - `@wcpos/sync-engine` fetchers skip asking the server for a term the local
 *    index could not match anyway
 *
 * It lived as four separate literals held together by three "keep equal to"
 * comments. sync-core is the only package all four consumers depend on.
 */

/** Shortest term the local search index can match. */
export const FLEXSEARCH_MIN_TERM_LENGTH = 3;
