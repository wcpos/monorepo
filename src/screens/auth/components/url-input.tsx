import * as React from 'react';

import { TextInputWithLabel } from '@wcpos/components/src/textinput';

import { t } from '../../../lib/translations';
import useSiteConnect from '../hooks/use-site-connect';

export default function UrlInput() {
	const { onConnect, loading, error } = useSiteConnect();

	return (
		<TextInputWithLabel
			label={t('Enter the URL of your WooCommerce store', { _tags: 'core' }) + ':'}
			prefix="https://"
			action={{ label: t('Connect', { _tags: 'core' }), action: onConnect }}
			type="url"
			clearable
			error={error}
			loading={loading}
		/>
	);
}
