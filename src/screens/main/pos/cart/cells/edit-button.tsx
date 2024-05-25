import * as React from 'react';

import Icon from '@wcpos/components/src/icon';

type CartLine =
	| import('@wcpos/database').OrderDocument['line_items'][number]
	| import('@wcpos/database').OrderDocument['fee_lines'][number]
	| import('@wcpos/database').OrderDocument['shipping_lines'][number];

interface Props {
	uuid: string;
	item: CartLine;
	Modal: React.ComponentType<{ uuid: string; item: CartLine; onClose: () => void }>;
}

/**
 *
 */
export const EditButton = ({ uuid, item, Modal }: Props) => {
	const [opened, setOpened] = React.useState(false);

	/**
	 *
	 */
	return (
		<>
			<Icon
				name="ellipsisVertical"
				onPress={() => setOpened(true)}
				// tooltip={t('Edit', { _tags: 'core' })}
			/>
			{opened && <Modal uuid={uuid} item={item} onClose={() => setOpened(false)} />}
		</>
	);
};
