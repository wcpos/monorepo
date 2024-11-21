import { AxiosRequestConfig } from 'axios';
import { Mock } from 'jest-mock';

interface MockResponse {
	[key: string]: any;
}

interface HttpClientMock {
	get: Mock<any, [string, AxiosRequestConfig?]>;
	post: Mock<any, [string, any, AxiosRequestConfig?]>;
	put: Mock<any, [string, any, AxiosRequestConfig?]>;
	delete: Mock<any, [string, AxiosRequestConfig?]>;
	__setMockResponse: (
		method: HttpMethod,
		url: string,
		response: any,
		options?: { params?: any; data?: any }
	) => void;
	__resetMockResponses: () => void;
}

type HttpMethod = 'get' | 'post' | 'put' | 'delete';

const mockResponses: Record<HttpMethod, Record<string, Record<string, any>>> = {
	get: {},
	post: {},
	put: {},
	delete: {},
};

const httpClientMock: HttpClientMock = {
	get: jest.fn((url: string, config?: AxiosRequestConfig) => {
		return resolveResponse('get', url, config);
	}),
	post: jest.fn((url: string, data: any, config?: AxiosRequestConfig) => {
		return resolveResponse('post', url, config, data);
	}),
	put: jest.fn((url: string, data: any, config?: AxiosRequestConfig) => {
		return resolveResponse('put', url, config, data);
	}),
	delete: jest.fn((url: string, config?: AxiosRequestConfig) => {
		return resolveResponse('delete', url, config);
	}),
	__setMockResponse: (
		method: HttpMethod,
		url: string,
		response: any,
		options: { params?: any; data?: any } = {}
	) => {
		const key = getMockKey(url, options.params, options.data);
		if (!mockResponses[method]) {
			mockResponses[method] = {};
		}
		mockResponses[method][key] = response;
	},
	__resetMockResponses: () => {
		Object.keys(mockResponses).forEach((method) => {
			mockResponses[method as HttpMethod] = {};
		});
	},
};

function getMockKey(url: string, params?: any, data?: any) {
	const paramsKey = params ? JSON.stringify(params) : '';
	const dataKey = data ? JSON.stringify(data) : '';
	return `${url}|params:${paramsKey}|data:${dataKey}`;
}

function resolveResponse(method: HttpMethod, url: string, config?: AxiosRequestConfig, data?: any) {
	const params = config?.params;
	const key = getMockKey(url, params, data);
	const methodResponses = mockResponses[method];
	const mockResponse = methodResponses[key];

	if (mockResponse !== undefined) {
		return Promise.resolve({ data: mockResponse });
	} else {
		// You might want to handle the case where no mock response is set
		// For now, let's throw an error to make it explicit
		console.error(`No mock response for ${method.toUpperCase()} ${key}`);
		return Promise.reject(new Error(`No mock response for ${method.toUpperCase()} ${key}`));
	}
}

export { httpClientMock };
