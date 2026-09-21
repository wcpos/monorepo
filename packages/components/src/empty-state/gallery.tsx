import type * as React from 'react';

import { EmptyState } from './index';

const examples: ({ id: string } & React.ComponentProps<typeof EmptyState>)[] = [
	{
		id: 'empty',
		kind: 'empty',
		title: 'No orders yet',
		description: 'Sales you take will appear here.',
	},
	{
		id: 'no-results',
		kind: 'no-results',
		title: 'No orders match these filters',
		action: { label: 'Clear filters', onPress: () => {} },
	},
	{
		id: 'failed',
		kind: 'failed',
		title: 'Orders could not be loaded',
		action: { label: 'Retry', onPress: () => {} },
		docs: { label: 'Help', href: 'https://docs.wcpos.com' },
	},
	{ id: 'title-only', kind: 'empty', title: 'No order found' },
	{ id: 'inline', kind: 'empty', size: 'inline', title: 'No variations' },
	{
		id: 'inline-action',
		kind: 'empty',
		size: 'inline',
		title: 'Nothing refunded yet',
		action: { label: 'Refund', onPress: () => {} },
	},
];
export const stories = examples.map(({ id, ...props }) => ({
	id,
	render: () => <EmptyState {...props} testID={`gallery-empty-state-${id}`} />,
}));
