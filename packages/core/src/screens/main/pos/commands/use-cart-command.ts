import * as React from 'react';

import { cartCommand, type CartCommand, type CartCommandEvent } from './cart-command';
import { useCartWrite } from './use-cart-write';
import { useActionContext } from '../hooks/use-action-context';
import { useCurrentOrderActions } from '../contexts/current-order';

/** One cart command: the target read at the press, the slot held, the dispatch and the write. */
export function useCartCommand<E extends CartCommandEvent>(event: E): CartCommand<E> {
	const { getCurrentOrderRecord } = useCurrentOrderActions();
	const { settledWrite } = useCartWrite();
	const { ctx, actor } = useActionContext();
	return React.useMemo(
		() => cartCommand(event, { ctx, actor, settledWrite, currentRecord: getCurrentOrderRecord }),
		[event, ctx, actor, settledWrite, getCurrentOrderRecord]
	);
}
