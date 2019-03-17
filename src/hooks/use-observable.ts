import { useEffect, useState } from 'react';

type Observable = import('rxjs').Observable<any>;

export default function useObservable(obs$: Observable, initial?: any, deps: any[] = []) {
	const [state, setState] = useState(initial);

	useEffect(() => {
		const subscription = obs$.subscribe(setState);
		return () => subscription.unsubscribe();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, deps);

	return state;
}
