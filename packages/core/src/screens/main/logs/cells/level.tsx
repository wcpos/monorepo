import * as React from 'react';

import { CellContext } from '@tanstack/react-table';

import { ButtonPill, ButtonText } from '@wcpos/components/button';

import type { QueryStateActions } from '../../../../query';

type LogDocument = import('@wcpos/database').LogDocument;

const variantMap: Record<string, string> = {
	error: 'ghost-error',
	warn: 'ghost-warning',
	info: 'ghost-secondary',
	debug: 'ghost-muted',
	success: 'ghost-success',
	audit: 'ghost-info',
};

/**
 *
 */
export function Level({ row, table }: CellContext<{ document: LogDocument }, 'level'>) {
	const log = row.original.document;
	const actions = (table.options.meta as { actions?: Pick<QueryStateActions<'logs'>, 'setFilter'> })
		?.actions;

	const handlePress = React.useCallback(() => {
		if (log.level) actions?.setFilter('level', [log.level]);
	}, [actions, log.level]);

	return (
		<ButtonPill
			variant={
				(log.level ? variantMap[log.level] : undefined) as React.ComponentProps<
					typeof ButtonPill
				>['variant']
			}
			size="xs"
			onPress={handlePress}
		>
			<ButtonText>{log.level}</ButtonText>
		</ButtonPill>
	);
}
