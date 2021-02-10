import { from, combineLatest } from 'rxjs';
import { switchMap, map, tap } from 'rxjs/operators';
/**
 * Calculate quantity * price
 */
export default (raw, model) => {
	combineLatest([model.quantity$, model.price$])
		.pipe(tap((res) => console.log(res)))
		.subscribe((val) => {
			model.atomicSet('total', String(val[0] * val[1]));
		});
};
