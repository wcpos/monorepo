import * as React from 'react';
import Skeleton from '../skeleton';

export interface TextSkeletonProps {
	length?: 'default' | 'short' | 'long';
}

const lengthMap = {
	default: 120,
	short: 60,
	long: 240,
};

export const TextSkeleton = ({ length = 'default' }: TextSkeletonProps) => {
	return <Skeleton width={lengthMap[length]} height={20} />;
};
