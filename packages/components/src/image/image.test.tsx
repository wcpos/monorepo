import { render } from '@testing-library/react';
import { Image as ExpoImage } from 'expo-image';

import { Image } from './index';

jest.mock('expo-image', () => ({ Image: jest.fn(() => null) }));
jest.mock('uniwind', () => ({ withUniwind: (component: unknown) => component }));

beforeEach(() => jest.clearAllMocks());

it('keeps the default transition an object, not a number, to skip memory-cache hits', () => {
	render(<Image source={{ uri: 'a.jpg' }} />);
	expect(jest.mocked(ExpoImage).mock.calls[0][0].transition).toEqual({
		duration: 250,
		skipOnCacheHit: 'memory',
	});
});

it('lets the caller override the transition', () => {
	render(<Image source={{ uri: 'a.jpg' }} transition={0} />);
	expect(jest.mocked(ExpoImage).mock.calls[0][0].transition).toBe(0);
});

it('keeps the content fit and responsive policy defaults', () => {
	render(<Image source={{ uri: 'a.jpg' }} />);
	expect(jest.mocked(ExpoImage).mock.calls[0][0].contentFit).toBe('contain');
	expect(jest.mocked(ExpoImage).mock.calls[0][0].responsivePolicy).toBe('initial');
});
