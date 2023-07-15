import { renderHook, act } from '@testing-library/react-hooks';

import useQuery, { QueryState } from './';

describe('useQuery', () => {
	it('initializes with the correct state', () => {
		const initialQuery: QueryState = {
			search: 'test',
			sortBy: 'id',
			sortDirection: 'asc',
			selector: {
				type: { $eq: 'item' },
			},
			limit: 10,
			skip: 0,
		};

		const { result } = renderHook(() => useQuery(initialQuery));

		expect(result.current.query.current).toEqual(initialQuery);
	});

	it('setQuery updates the query state', () => {
		const initialQuery: QueryState = {
			search: '',
			sortBy: 'id',
			sortDirection: 'asc',
			selector: {
				type: { $eq: 'item' },
			},
			limit: 10,
			skip: 0,
		};

		const { result } = renderHook(() => useQuery(initialQuery));

		act(() => {
			result.current.setQuery('search', 'test');
		});

		expect(result.current.query.current.search).toEqual('test');
	});

	it('setQuery with a function updates the query state', () => {
		const initialQuery: QueryState = {
			search: 'initial',
			sortBy: 'id',
			sortDirection: 'asc',
			selector: {
				type: { $eq: 'item' },
			},
			limit: 10,
			skip: 0,
		};

		const { result } = renderHook(() => useQuery(initialQuery));

		act(() => {
			result.current.setQuery((prevQuery: QueryState) => ({
				...prevQuery,
				search: 'updated',
			}));
		});

		expect(result.current.query.current.search).toEqual('updated');
	});
});
