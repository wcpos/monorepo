import {
	parseHeaders,
	defaultPrepareQueryParams,
	transformMangoSelector,
} from './replication.helpers';
// import { parseLinkHeader } from '../../../../lib/url';

// jest.mock('../../../../lib/url', () => ({
// 	parseLinkHeader: jest.fn(),
// }));

// describe('parseHeaders', () => {
// 	it('should correctly parse the headers', () => {
// 		const mockResponse = {
// 			headers: {
// 				link: '<https://example.com/api?page=2>; rel="next"',
// 				'x-wp-total': '100',
// 				'x-wp-totalpages': '10',
// 			},
// 		};
// 		parseLinkHeader.mockReturnValue({
// 			next: {
// 				page: '2',
// 			},
// 		});

// 		const result = parseHeaders(mockResponse);

// 		expect(result).toEqual({
// 			remoteTotal: '100',
// 			totalPages: '10',
// 			nextPage: '2',
// 		});
// 	});
// });

// describe('mapKeyToParam', () => {
// 	it('should map the key correctly', () => {
// 		expect(mapKeyToParam('categories')).toEqual('category');
// 		expect(mapKeyToParam('tags')).toEqual('tag');
// 		expect(mapKeyToParam('other')).toEqual('other');
// 	});
// });

describe('transformMangoSelector', () => {
	it('should return an empty object if selector is not provided', () => {
		const result = transformMangoSelector(null);

		expect(result).toEqual({});
	});

	it('should transform category and tags for product queries', () => {
		const selector = {
			categories: { $elemMatch: { id: 1 } },
			tags: { $elemMatch: { id: 2 } },
			other: 'value',
		};

		const result = transformMangoSelector(selector);

		expect(result).toEqual({
			category: 1,
			tag: 2,
			other: 'value',
		});
	});

	it('should transform id queries, eg: for product variations', () => {
		const selector = {
			id: {
				$in: [14, 15, 16],
			},
		};

		const result = transformMangoSelector(selector);

		expect(result).toEqual({
			includes: '14,15,16',
		});
	});

	it('should transform order status, eg: cart orders', () => {
		const selector = {
			status: 'pos-open',
		};

		const result = transformMangoSelector(selector);

		expect(result).toEqual({
			status: 'pos-open',
		});
	});
});

describe('defaultPrepareQueryParams', () => {
	it('should prepare the query params correctly', () => {
		const query = {
			selector: {
				categories: { $elemMatch: { id: 1 } },
				tags: { $elemMatch: { id: 2 } },
				other: 'value',
			},
			sortDirection: 'asc',
			sortBy: 'date',
		};

		const checkpoint = {
			lastModified: '2023-03-30T00:00:00Z',
			completeIntitalSync: true,
			remoteTotal: '100',
			totalPages: '10',
			nextPage: '2',
		};

		const batchSize = 25;

		// @ts-ignore
		const result = defaultPrepareQueryParams(query, checkpoint, batchSize);

		expect(result).toEqual({
			category: 1,
			tag: 2,
			other: 'value',
			order: 'asc',
			orderby: 'date',
			page: '2',
			per_page: 25,
			modified_after: '2023-03-30T00:00:00Z',
			dates_are_gmt: true,
		});
	});

	it('should set modified_after to null if completeIntitalSync is false', () => {
		const query = {
			selector: {
				categories: { $elemMatch: { id: 1 } },
				tags: { $elemMatch: { id: 2 } },
				other: 'value',
			},
			sortDirection: 'asc',
			sortBy: 'date',
		};

		const checkpoint = {
			lastModified: '2023-03-30T00:00:00Z',
			completeIntitalSync: false,
			remoteTotal: '100',
			totalPages: '10',
			nextPage: '2',
		};

		const batchSize = 25;

		// @ts-ignore
		const result = defaultPrepareQueryParams(query, checkpoint, batchSize);

		expect(result).toEqual({
			category: 1,
			tag: 2,
			other: 'value',
			order: 'asc',
			orderby: 'date',
			page: '2',
			per_page: 25,
			modified_after: null,
			dates_are_gmt: true,
		});
	});

	it('should set nextPage to 1 if not provided in checkpoint', () => {
		const query = {
			selector: {
				categories: { $elemMatch: { id: 1 } },
				tags: { $elemMatch: { id: 2 } },
				other: 'value',
			},
			sortDirection: 'asc',
			sortBy: 'date',
		};
		const checkpoint = {
			lastModified: '2023-03-30T00:00:00Z',
			completeIntitalSync: true,
			remoteTotal: '100',
			totalPages: '10',
		};

		const batchSize = 25;

		// @ts-ignore
		const result = defaultPrepareQueryParams(query, checkpoint, batchSize);

		expect(result).toEqual({
			category: 1,
			tag: 2,
			other: 'value',
			order: 'asc',
			orderby: 'date',
			page: 1,
			per_page: 25,
			modified_after: '2023-03-30T00:00:00Z',
			dates_are_gmt: true,
		});
	});
});
