import * as React from 'react';

import { render } from '@testing-library/react';

import { TitleBarStripProvider } from '../edge-surface';
import { TooltipContent } from './index.web';

import type { TooltipContentProps } from './types';

const mockContent = jest.fn((_props: TooltipContentProps) => null);
jest.mock('@rn-primitives/tooltip', () => ({
	Portal: ({ children }: React.PropsWithChildren) => <>{children}</>,
	Overlay: ({ children }: React.PropsWithChildren) => <>{children}</>,
	Content: (props: TooltipContentProps) => mockContent(props),
}));
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: { View: ({ children }: React.PropsWithChildren) => <>{children}</> },
}));
jest.mock('../lib/overlay', () => ({
	OVERLAY_MOTION: { anchored: { enter: '', entering: {}, exiting: {} } },
}));
jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

it.each([
	['adds the strip when no insets are supplied', 28, undefined, { top: 28 }],
	['raises a smaller top inset', 28, { top: 8, bottom: 4 }, { top: 28, bottom: 4 }],
	['keeps a larger caller inset', 28, { top: 40, left: 6 }, { top: 40, left: 6 }],
	['keeps caller insets without a strip', 0, { top: 8, right: 3 }, { top: 8, right: 3 }],
	['keeps absent insets without a strip', 0, undefined, undefined],
] as const)('%s', (_case, height, insets, expected) => {
	render(
		<TitleBarStripProvider value={{ node: null, height }}>
			<TooltipContent insets={insets} />
		</TitleBarStripProvider>
	);
	expect(mockContent.mock.calls.at(-1)?.[0].insets).toEqual(expected);
});
