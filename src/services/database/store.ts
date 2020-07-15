import { from } from 'rxjs';
import {
	tap,
	share,
	switchMap,
	delayWhen,
	map,
	withLatestFrom,
	flatMap,
	startWith,
	take,
	shareReplay,
	filter,
	mergeMap,
	toArray,
} from 'rxjs/operators';
import getDatabase from '../../database/adapter';
import createProductsCollection from '../../database/stores/products';
import createOrdersCollection from '../../database/stores/orders';
import createCustomersCollection from '../../database/stores/customers';

class StoreDatabaseService {
	public database$ = from(getDatabase(this.name)).pipe(
		delayWhen((db) => from(createProductsCollection(db))),
		delayWhen((db) => from(createOrdersCollection(db))),
		delayWhen((db) => from(createCustomersCollection(db))),
		delayWhen((db) => this.init(db)),
		shareReplay(1)
	);

	public constructor(private name: string) {
		// this.name = name;
	}

	private init(db) {}
}
export default StoreDatabaseService;
