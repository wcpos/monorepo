const httpClientMock = {
	get: jest.fn().mockResolvedValue({ data: {} }),
	post: jest.fn().mockResolvedValue({ data: {} }),
	put: jest.fn().mockResolvedValue({ data: {} }),
	delete: jest.fn().mockResolvedValue({ data: {} }),
	// ... other methods that your httpClient might have
};

export default httpClientMock;
