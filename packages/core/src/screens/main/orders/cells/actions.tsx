import * as React from 'react';

import { Icon } from '@wcpos/components/icon';
import type { EngineRecord } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

// The same caret the touch row trails with: the row opens the order, and the modal's
// footer carries every action, so the column is an affordance, not a menu.
export function Actions(_: CellContext<{ record: EngineRecord<'orders'> }, 'actions'>) {
	return <Icon name="chevronRight" className="text-muted-foreground" />;
}
