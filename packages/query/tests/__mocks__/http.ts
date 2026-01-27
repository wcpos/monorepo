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
	__enableVerbose: () => void;
	__disableVerbose: () => void;
}

type HttpMethod = 'get' | 'post' | 'put' | 'delete';

const mockResponses: Record<HttpMethod, Record<string, Record<string, any>>> = {
	get: {},
	post: {},
	put: {},
	delete: {},
};

/**
 * Whether to log warnings for unmocked requests.
 * Disabled by default to reduce test noise.
 */
let verboseMode = false;

/**
 * Default responses for common sync endpoints.
 * These prevent "No mock response" errors for tests that don't care about sync.
 * Tests that need specific responses can still use __setMockResponse to override.
 */
const defaultResponses: Record<HttpMethod, Record<string, any>> = {
	get: {
		// fetchAllRemoteIds - return empty array (no remote records)
		products: [],
		variations: [],
		orders: [],
		customers: [],
		'products/categories': [],
		'products/tags': [],
	},
	post: {
		// fetchRemoteByIDs - return empty array (no records to fetch)
		products: [],
		variations: [],
		orders: [],
		customers: [],
	},
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
	__enableVerbose: () => {
		verboseMode = true;
	},
	__disableVerbose: () => {
		verboseMode = false;
	},
};

function getMockKey(url: string, params?: any, data?: any) {
	const paramsKey = params ? JSON.stringify(params) : '';
	const dataKey = data ? JSON.stringify(data) : '';
	return `${url}|params:${paramsKey}|data:${dataKey}`;
}

/**
 * Check if actual params contain all expected params (partial match)
 * This allows tests to specify only the params they care about,
 * while the actual code may include additional params like `signal`
 */
function paramsMatch(expectedParams: any, actualParams: any): boolean {
	if (!expectedParams) return true;
	if (!actualParams) return false;

	for (const key of Object.keys(expectedParams)) {
		// Skip AbortSignal comparison - it's always different
		if (key === 'signal') continue;

		const expected = expectedParams[key];
		const actual = actualParams[key];

		if (JSON.stringify(expected) !== JSON.stringify(actual)) {
			return false;
		}
	}
	return true;
}

/**
 * Find a matching mock response, supporting partial param matching
 */
function findMockResponse(method: HttpMethod, url: string, actualParams?: any, actualData?: any): any {
	const methodResponses = mockResponses[method];

	// First try exact match
	const exactKey = getMockKey(url, actualParams, actualData);
	if (methodResponses[exactKey] !== undefined) {
		return methodResponses[exactKey];
	}

	// Fall back to partial matching - find any response for this URL
	// where the expected params are a subset of actual params
	for (const key of Object.keys(methodResponses)) {
		const [keyUrl, paramsStr, dataStr] = key.split('|');

		if (keyUrl !== url) continue;

		// Parse the expected params/data from the key
		const expectedParamsJson = paramsStr.replace('params:', '');
		const expectedDataJson = dataStr.replace('data:', '');

		const expectedParams = expectedParamsJson ? JSON.parse(expectedParamsJson) : undefined;
		const expectedData = expectedDataJson ? JSON.parse(expectedDataJson) : undefined;

		// Check if params match (partial)
		if (paramsMatch(expectedParams, actualParams) && paramsMatch(expectedData, actualData)) {
			return methodResponses[key];
		}
	}

	return undefined;
}

function resolveResponse(method: HttpMethod, url: string, config?: AxiosRequestConfig, data?: any) {
	const params = config?.params;
	const mockResponse = findMockResponse(method, url, params, data);

	if (mockResponse !== undefined) {
		return Promise.resolve({ data: mockResponse });
	}

	// Check for default response (for common sync endpoints)
	const defaultResponse = defaultResponses[method]?.[url];
	if (defaultResponse !== undefined) {
		return Promise.resolve({ data: defaultResponse });
	}

	// No mock response found
	const key = getMockKey(url, params, data);
	if (verboseMode) {
		console.warn(`No mock response for ${method.toUpperCase()} ${key}`);
	}
	return Promise.reject(new Error(`No mock response for ${method.toUpperCase()} ${key}`));
}

export { httpClientMock };

// Mock for @wcpos/hooks/use-http-client/parse-wp-error
export const parseWpError = jest.fn((data: any, fallbackMessage: string) => ({
	message: fallbackMessage,
	code: null,
	serverCode: null,
	status: null,
}));
