import * as React from 'react';
import { Skeleton, SkeletonProps } from './skeleton';

export default {
	title: 'Components/Skeleton',
	component: Skeleton,
};

/**
 *
 */
export const BasicUsage = (props: SkeletonProps) => <Skeleton {...props} />;
BasicUsage.args = {
	width: 100,
	height: 100,
};
