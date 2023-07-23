import { of } from 'rxjs';

import { Query, QueryState } from './';

jest.useFakeTimers();

describe('Query', () => {
	const initialQueryState: QueryState = {
		sortBy: 'name',
		sortDirection: 'asc',
	};

	let mockCollection: any;
	let query: Query<any>;

	beforeEach(() => {
		mockCollection = {
			find: jest.fn().mockReturnThis(),
			exec: jest.fn().mockResolvedValue(['fakeData']),
			$: of(['fakeData']),
		};

		query = new Query(initialQueryState).collection(mockCollection);
	});

	it('should construct', () => {
		expect(query).toBeInstanceOf(Query);
	});

	it('should execute the query', async () => {
		const result = await query.exec();
		expect(result).toEqual(['fakeData']);
		expect(mockCollection.find).toHaveBeenCalledWith({
			selector: {},
			sort: [{ name: 'asc' }],
			limit: undefined,
			skip: undefined,
		});
	});

	it('should subscribe to query.$', (done) => {
		query.$.subscribe((result) => {
			expect(result).toEqual(['fakeData']);
			done();
		});
	});

	it('should update the query when where is called', async () => {
		query.where('foo', 'bar');
		const result = await query.exec();
		expect(result).toEqual(['fakeData']);
		expect(mockCollection.find).toHaveBeenCalledWith({
			selector: { foo: 'bar' },
			sort: [{ name: 'asc' }],
			limit: undefined,
			skip: undefined,
		});
	});

	it('should update the where clause and emit the new selector', (done) => {
		const query = new Query({ sortBy: 'name', sortDirection: 'asc' });
		query.state$.subscribe((state) => {
			if (state?.selector) {
				expect(state.selector.foo).toEqual('bar');
				done();
			}
		});
		query.where('foo', 'bar');
	});

	test('should get current query state', () => {
		const currentState = query.currentState;
		expect(currentState).toEqual(initialQueryState);
	});

	test('should subscribe to query state changes', (done) => {
		query.state$.subscribe((newState) => {
			expect(newState).toEqual({
				sortBy: 'id',
				sortDirection: 'asc',
			});
			done();
		});

		query.sort('id', 'asc');
	});

	describe('search', () => {
		it('should update the search query state', (done) => {
			const query = new Query({ sortBy: 'name', sortDirection: 'asc' });
			const searchValues: (string | Record<string, any>)[] = ['foo', { bar: 'baz' }];
			let testIndex = 0;

			query.state$.subscribe((state) => {
				if (state?.search) {
					expect(state.search).toEqual(searchValues[testIndex++]);
					if (testIndex === searchValues.length) {
						done(); // Complete the test after both values have been verified
					}
				}
			});

			// Trigger the search
			searchValues.forEach((value) => query.search(value));
		});
	});

	describe('debouncedSearch', () => {
		it('should debounce the search operation', () => {
			const query = new Query({ sortBy: 'name', sortDirection: 'asc' });
			const spy = jest.spyOn(query, 'search');
			query.debouncedSearch('foo');
			expect(spy).not.toHaveBeenCalled();
			jest.runAllTimers();
			expect(spy).toHaveBeenCalledWith('foo');
		});
	});
});
