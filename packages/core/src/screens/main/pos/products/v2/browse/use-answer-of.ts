import * as React from 'react';

import type { Observable } from 'rxjs';

/**
 * The latest emission of THIS observable, paired with it: a new observable starts at
 * `undefined` until it has emitted, and a late emission of the old one is dropped. A binding's
 * `result$` is a new observable per compiled query (query-bindings memoises it on the compiled
 * read), so this is how an answer is known to belong to the query now asked — `valueRef$$`
 * keeps the previous answer across a reload and cannot say.
 */
export function useAnswerOf<T>(source$: Observable<T>): T | undefined {
	const [answer, setAnswer] = React.useState<{ of: Observable<T>; value: T } | undefined>(
		undefined
	);
	React.useEffect(() => {
		const subscription = source$.subscribe((value) => setAnswer({ of: source$, value }));
		return () => subscription.unsubscribe();
	}, [source$]);
	return answer?.of === source$ ? answer.value : undefined;
}
