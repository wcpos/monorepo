import { readFileSync } from 'node:fs';

import * as React from 'react';
import type { ViewProps } from 'react-native';

import { act, fireEvent, render } from '@testing-library/react';

import { PanelResizeHandle } from './index';

import type { PanelResizeHandleProps } from 'react-native-resizable-panels';

let mockDirection = 'horizontal';
let mockHandle: PanelResizeHandleProps;
let mockPointer: 'fine' | 'coarse' = 'fine';
jest.mock('../lib/device', () => ({ usePointer: () => mockPointer }));
jest.mock('react-native', () => ({
	View: ({ children, className, onPointerEnter, onPointerLeave }: ViewProps) => (
		<div
			className={className}
			onPointerEnter={onPointerEnter as unknown as React.PointerEventHandler}
			onPointerLeave={onPointerLeave as unknown as React.PointerEventHandler}
		>
			{children}
		</div>
	),
}));
jest.mock('react-native-resizable-panels', () => ({
	usePanelGroupContext: () => ({ direction: mockDirection }),
	PanelResizeHandle: (props: PanelResizeHandleProps) => {
		mockHandle = props;
		return <div>{props.children}</div>;
	},
}));

it.each(['horizontal', 'vertical'])(
	'paints the %s bar from dragging and fine-pointer hover state',
	(direction) => {
		mockDirection = direction;
		mockPointer = 'fine';
		const { container } = render(
			<PanelResizeHandle testID="handle" order={2} hitTargetSize={32} disableDoubleTap />
		);
		const bar = container.firstElementChild!.firstElementChild!;
		expect(bar).toHaveClass(
			'bg-border',
			...(direction === 'horizontal' ? ['h-12', 'w-1'] : ['h-1', 'w-12'])
		);
		expect(mockHandle).toMatchObject({
			testID: 'handle',
			order: 2,
			hitTargetSize: 32,
			disableDoubleTap: true,
		});
		act(() => mockHandle.onDragging?.(true));
		expect(bar).toHaveClass('bg-primary');
		act(() => mockHandle.onDragging?.(false));
		expect(bar).toHaveClass('bg-border');
		fireEvent.pointerEnter(bar);
		expect(bar).toHaveClass('bg-muted-foreground');
		act(() => mockHandle.onDragging?.(true));
		expect(bar).toHaveClass('bg-primary');
		fireEvent.pointerLeave(bar);
		act(() => mockHandle.onDragging?.(false));
		expect(bar).toHaveClass('bg-border');
		// A touch screen never hovers: the key is read at render, so render again under it.
		mockPointer = 'coarse';
		const coarse = render(<PanelResizeHandle testID="touch" />).container.firstElementChild!
			.firstElementChild!;
		fireEvent.pointerEnter(coarse);
		expect(coarse).toHaveClass('bg-border');
	}
);

it('retires the hover pill and literal animation', () => {
	expect(readFileSync(`${__dirname}/index.tsx`, 'utf8')).not.toMatch(
		/group|duration-|animate-|Icon|Platform/
	);
});
