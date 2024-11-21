import { httpClientMock } from './__mocks__/http';
import { DataFetcher } from '../src/data-fetcher';

describe('DataFetcher', () => {
	let dataFetcher: DataFetcher;

	beforeEach(() => {
		dataFetcher = new DataFetcher(httpClientMock, 'products');
	});

	it('fetches all remote IDs', async () => {
		const mockData = [{ id: 1 }, { id: 2 }];
		httpClientMock.get.mockResolvedValue({ data: mockData });

		const response = await dataFetcher.fetchAllRemoteIds();

		expect(httpClientMock.get).toHaveBeenCalledWith('products', {
			params: { fields: ['id', 'date_modified_gmt'], posts_per_page: -1 },
		});
		expect(response.data).toEqual(mockData);
	});
});
