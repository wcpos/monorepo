import React from 'react';
import { render } from '@testing-library/react';
import App from './app';

jest.mock('./database', () => () => ({
	foo: 'bar',
}));

jest.mock('react-native-gesture-handler', () => {
	return {
		Direction: {},
	};
});

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

describe('App', () => {
	it('renders correctly', () => {
		const { container } = render(<App />);
		expect(container.firstChild).toBeInTheDocument();
	});
});
