import type * as React from 'react';

import { useT } from '@wcpos/core/contexts/translations';

import { Numpad } from './index';

function Example(props: Omit<React.ComponentProps<typeof Numpad>, 'changeSignLabel'>) {
	const t = useT();
	return <Numpad {...props} changeSignLabel={t('common.change_sign')} />;
}
const examples: ({ id: string } & React.ComponentProps<typeof Example>)[] = [
	{ id: 'default', initialValue: 12.5, formatDisplay: (value) => value.toFixed(2) },
	{ id: 'discounts', initialValue: 12.5, discounts: [5, 10, 15, 20] },
	{ id: 'negative', initialValue: -12.5 },
];
export const stories = examples.map(({ id, ...props }) => ({
	id,
	render: () => <Example {...props} />,
}));
