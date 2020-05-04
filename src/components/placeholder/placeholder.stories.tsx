import React from 'react';

import { storiesOf } from '@storybook/react';

import Placeholder from './';

storiesOf('Placeholder', module)
	/**
	 *
	 */
	.add('basic usage', () => (
		<Placeholder>
			<Placeholder.Item flexDirection="row" alignItems="center">
				<Placeholder.Item width={60} height={60} borderRadius={50} />
				<Placeholder.Item marginLeft={20}>
					<Placeholder.Item width={120} height={20} borderRadius={4} />
					<Placeholder.Item marginTop={6} width={80} height={20} borderRadius={4} />
				</Placeholder.Item>
			</Placeholder.Item>
		</Placeholder>
	));
