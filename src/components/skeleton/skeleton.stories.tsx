import React from 'react';
import Placeholder from './skeleton';
import readme from './README.md';

export default {
	title: 'Components/Placeholder',
	parameters: {
		notes: { readme },
	},
};

/**
 *
 */
export const basicUsage = () => (
	<Placeholder>
		<Placeholder.Item width={100} height={50} />
		<Placeholder.Item marginTop={10} width={100} height={50} />
		<Placeholder.Item style={{ marginTop: 10, width: 100, height: 50 }} />
	</Placeholder>
);

/**
 *
 */
export const complexUsage = () => (
	<Placeholder>
		<Placeholder.Item flexDirection="row" alignItems="center">
			<Placeholder.Item width={60} height={60} borderRadius={50} />
			<Placeholder.Item marginLeft={20}>
				<Placeholder.Item width={120} height={20} borderRadius={4} />
				<Placeholder.Item marginTop={6} width={80} height={20} borderRadius={4} />
			</Placeholder.Item>
		</Placeholder.Item>
	</Placeholder>
);
