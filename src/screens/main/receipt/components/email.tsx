import * as React from 'react';

import Box from '@wcpos/components/src/box';
import Checkbox from '@wcpos/components/src/checkbox';
import { TextInputWithLabel } from '@wcpos/components/src/textinput';

import { t } from '../../../../lib/translations';

/**
 *
 */
export const EmailModal = ({ emailFieldRef, saveCheckboxRef }) => {
	/**
	 *
	 */
	return (
		<Box space="medium">
			<TextInputWithLabel ref={emailFieldRef} label={t('Email Address', { _tags: 'core' })} />
			<Checkbox
				ref={saveCheckboxRef}
				label={t('Save email to Billing Address', { _tags: 'core' })}
			/>
		</Box>
	);
};
