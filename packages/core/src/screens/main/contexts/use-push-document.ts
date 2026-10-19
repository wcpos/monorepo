import * as React from 'react';

import { useQueryRuntime } from '@wcpos/query';
import { pushRecord } from '@wcpos/query/mutations';

export { enqueueRecordWrite as enqueueDocumentWrite } from '@wcpos/query/mutations';

export const usePushDocument = () => {
	const runtime = useQueryRuntime();

	return React.useCallback(
		(document: Parameters<typeof pushRecord>[1]) => pushRecord(runtime, document),
		[runtime]
	);
};
