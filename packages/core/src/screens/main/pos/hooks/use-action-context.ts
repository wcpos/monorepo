import * as React from 'react';

import { useDocField, useQueryRuntime } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';

import { readStockDocument } from './read-stock-document';
import { useAppState, useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import {
	type ActionActor,
	type ActionContext,
	createActionContext,
} from '../../../../extensions/actions';
import { useRegister } from '../../../../services/register/use-register';

const logger = getLogger(['wcpos', 'pos', 'actions']);

export function useActionContext(): { ctx: ActionContext; actor: ActionActor } {
	const runtime = useQueryRuntime();
	const t = useT();
	const { store } = useAppState();
	const preventOverselling = useDocField(store, (value) => value.prevent_overselling) === true;
	const { wpCredentials } = useStoreSession();
	const userId = wpCredentials.id ?? null;
	const registerId = useRegister()?.id ?? null;
	return React.useMemo(
		() => ({
			ctx: createActionContext({
				// The logger's `error` wants a code the contract does not carry; a hook's row is a warn
				// at most, so the widened call is safe and the type is the only thing in the way.
				log: (level, message, options) =>
					(logger[level] as (message: string, options?: unknown) => void)(message, options),
				t,
				readCatalog: async (kind, id) =>
					(await readStockDocument(
						runtime,
						kind === 'product' ? 'products' : 'variations',
						id
					)) as Record<string, unknown> | null,
				preventOverselling,
			}),
			actor: { userId, registerId, sessionId: null }, // Stamped when the checkout slice lands.
		}),
		[runtime, t, preventOverselling, userId, registerId]
	);
}
