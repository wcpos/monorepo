import * as React from 'react';

import { useDocField, useQueryRuntime } from '@wcpos/query';

import { useStoreSession } from '../../../../../contexts/app-state';
import { usePushDocument } from '../../../contexts/use-push-document';
import { useLocalMutation } from '../../../hooks/mutations/use-local-mutation';
import { useStockAdjustment } from '../../../hooks/use-stock-adjustment';
import { useActionContext } from '../../hooks/use-action-context';

import type { SaleContext } from '../sale-completion';

export function useSaleContext(): SaleContext & { actor: NonNullable<SaleContext['actor']> } {
	const { userDB, storeDB, site, store, wpCredentials } = useStoreSession();
	const { ctx: actionCtx, actor: actionActor } = useActionContext();
	const sessionsOn = !!useDocField(store, (value) => value.register_sessions);
	// The latest store document, not the session's snapshot (see use-tender-flow).
	const dp = useDocField(store, (value) => value.price_num_decimals) ?? 2;
	const runtime = useQueryRuntime();
	const { localPatch } = useLocalMutation();
	const pushDocument = usePushDocument();
	const { stockAdjustment } = useStockAdjustment();
	const actor = React.useMemo(
		() => ({
			id: String(wpCredentials?.id ?? ''),
			name: wpCredentials?.display_name || wpCredentials?.username || '',
		}),
		[wpCredentials?.id, wpCredentials?.display_name, wpCredentials?.username]
	);
	return React.useMemo(
		() => ({
			userDB,
			storeDB,
			siteUuid: site.uuid!,
			storeId: store.id,
			sessionsOn,
			runtime,
			dp,
			actor,
			actionCtx,
			actionActor,
			localPatch,
			pushDocument,
			stockAdjustment,
		}),
		[
			userDB,
			storeDB,
			site.uuid,
			store.id,
			dp,
			sessionsOn,
			runtime,
			actor,
			actionCtx,
			actionActor,
			localPatch,
			pushDocument,
			stockAdjustment,
		]
	);
}
