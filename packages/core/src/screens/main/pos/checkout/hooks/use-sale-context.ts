import * as React from 'react';

import { useDocField, useQueryRuntime } from '@wcpos/query';

import { useStoreSession } from '../../../../../contexts/app-state';
import { useRegisterSessionCollection } from '../../../../../services/register-session/use-register-session-collections';
import { usePushDocument } from '../../../contexts/use-push-document';
import { useLocalMutation } from '../../../hooks/mutations/use-local-mutation';
import { useStockAdjustment } from '../../../hooks/use-stock-adjustment';

import type { SaleContext } from '../sale-completion';

export function useSaleContext(): SaleContext & { actor: NonNullable<SaleContext['actor']> } {
	const { userDB, storeDB, site, store, wpCredentials } = useStoreSession();
	const sessions = useRegisterSessionCollection();
	const sessionsOn = !!useDocField(store, (value) => value.register_sessions);
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
			sessions,
			sessionsOn,
			runtime,
			dp: store.price_num_decimals ?? 2,
			actor,
			localPatch,
			pushDocument,
			stockAdjustment,
		}),
		[
			userDB,
			storeDB,
			site.uuid,
			store.id,
			store.price_num_decimals,
			sessions,
			sessionsOn,
			runtime,
			actor,
			localPatch,
			pushDocument,
			stockAdjustment,
		]
	);
}
