import * as React from 'react';

import type { Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/types';

type Orientation = 'horizontal' | 'vertical';

const edgeToOrientationMap: Record<Edge, Orientation> = {
	top: 'horizontal',
	bottom: 'horizontal',
	left: 'vertical',
	right: 'vertical',
};

const orientationStyles: Record<Orientation, React.HTMLAttributes<HTMLElement>['className']> = {
	horizontal: 'h-[2px] left-[4px] right-0 before:left-[-8px]',
	vertical: 'w-[2px] top-[4px] bottom-0 before:top-[-8px]',
};

const strokeSize = 2;

/**
 * This is a tailwind port of `@atlaskit/pragmatic-drag-and-drop-react-drop-indicator/box`
 */
export function DropIndicator({ edge, gap }: { edge: Edge; gap: string }) {
	const lineOffset = `calc(-0.5 * (${gap} + ${strokeSize}px))`;
	const orientation = edgeToOrientationMap[edge];

	const edgeStyleMap: Record<Edge, React.CSSProperties> = {
		top: { top: lineOffset },
		right: { right: lineOffset },
		bottom: { bottom: lineOffset },
		left: { left: lineOffset },
	};

	const edgeClassMap: Record<Edge, string> = {
		top: 'before:top-[-3px]',
		right: 'before:right-[-3px]',
		bottom: 'before:bottom-[-3px]',
		left: 'before:left-[-3px]',
	};

	return (
		<div
			style={edgeStyleMap[edge]}
			className={`pointer-events-none absolute z-10 box-border bg-blue-700 before:absolute before:h-[8px] before:w-[8px] before:rounded-full before:border-[2px] before:border-solid before:border-blue-700 before:content-[''] ${orientationStyles[orientation]} ${edgeClassMap[edge]}`}
		></div>
	);
}
