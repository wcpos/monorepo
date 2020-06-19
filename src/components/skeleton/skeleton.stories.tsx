import React from 'react';
import Skeleton from './skeleton';
import readme from './README.md';

export default {
	title: 'Components/Skeleton',
	parameters: {
		notes: { readme },
	},
};

/**
 *
 */
export const basicUsage = () => (
	<Skeleton>
		<Skeleton.Item width={100} height={50} />
		<Skeleton.Item marginTop={10} width={100} height={50} />
		<Skeleton.Item style={{ marginTop: 10, width: 100, height: 50 }} />
	</Skeleton>
);

/**
 *
 */
export const complexUsage = () => (
	<Skeleton>
		<Skeleton.Item flexDirection="row" alignItems="center">
			<Skeleton.Item width={60} height={60} borderRadius={50} />
			<Skeleton.Item marginLeft={20}>
				<Skeleton.Item width={120} height={20} borderRadius={4} />
				<Skeleton.Item marginTop={6} width={80} height={20} borderRadius={4} />
			</Skeleton.Item>
		</Skeleton.Item>
	</Skeleton>
);
