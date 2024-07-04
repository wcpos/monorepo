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
  __setMockResponse: (method: HttpMethod, url: string, params: Record<string, any>, response: any) => void;
  __resetMockResponses: () => void;
}

type HttpMethod = 'get' | 'post' | 'put' | 'delete';

const mockResponses: Record<string, MockResponse> = {};

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
  __setMockResponse: (method: HttpMethod, url: string, params: Record<string, any>, response: any) => {
    const key = `${method}:${url}:${JSON.stringify(params) || ''}`;
    mockResponses[key] = response;
  },
  __resetMockResponses: () => {
    Object.keys(mockResponses).forEach(key => delete mockResponses[key]);
  },
};

const standardErrorResponses = {
  unauthorized: { status: 401, data: { message: 'Not authorized' } },
  serverError: { status: 500, data: { message: 'Internal server error' } },
  badRequest: { status: 400, data: { message: 'Bad request' } },
};

function resolveResponse(method: HttpMethod, url: string, config?: AxiosRequestConfig, data?: any) {
  const key = `${method}:${url}:${JSON.stringify(config?.params) || ''}`;
  if (mockResponses[key]) {
    return Promise.resolve({ data: mockResponses[key] });
  } else if (mockResponses[method] && mockResponses[method][url]) {
    return Promise.resolve({ data: mockResponses[method][url] });
  } else {
    return Promise.resolve({ data: [] }); // Default response is an empty array
  }
}

export { httpClientMock, standardErrorResponses };
