import { View, type ViewProps } from 'react-native';

import { cn } from '../lib/utils';

type SkeletonProps = ViewProps & { shape?: 'block' | 'line' | 'row' | 'tile' };
const shapes = {
	block: 'flex-1 w-full',
	line: 'h-5',
	row: 'h-row w-full',
	tile: 'h-tile w-full',
};

export function Skeleton({ shape = 'block', className, ...props }: SkeletonProps) {
	return (
		<View {...props} className={cn('bg-muted rounded-lg', shapes[shape], className)} aria-busy />
	);
}

export const SKELETON_MAX_ROWS = 12;

export function skeletonCount(extent: number, rowHeight: number): number {
	if (!Number.isFinite(extent) || extent <= 0) return 1;
	if (!Number.isFinite(rowHeight) || rowHeight <= 0) return 1;
	return Math.min(SKELETON_MAX_ROWS, Math.max(1, Math.ceil(extent / rowHeight)));
}
