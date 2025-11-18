import * as React from 'react';

import { get } from 'lodash';
import { CellContext } from '@tanstack/react-table';

import { Text } from '@wcpos/components/text';
import { openExternalURL } from '@wcpos/utils/open-external-url';
import { getErrorCodeDocURL } from '@wcpos/utils/logger/constants';

type LogDocument = import('@wcpos/database').LogDocument;

/**
 * Displays error code as a clickable link to documentation
 */
export function Code({ row }: CellContext<{ document: LogDocument }, 'code'>) {
	const item = row.original.document;
	const code = get(item, ['context', 'errorCode'], '') as string;

	if (!code) {
		return null;
	}

	return (
		<Text
			variant="link"
			onPress={() => {
				openExternalURL(getErrorCodeDocURL(code));
			}}
		>
			{code}
		</Text>
	);
}
