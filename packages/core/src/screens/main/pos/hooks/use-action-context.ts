import * as React from 'react';

import { useDocField, useQueryRuntime } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';

import { readStockDocument } from './read-stock-document';
import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import {
	type ActionActor,
	type ActionContext,
	createActionContext,
} from '../../../../extensions/actions';
import { useRegister } from '../../../../services/register/use-register';
import { readBoundRegister } from '../../../../services/register/register-document';
import { findOpenSession } from '../../../../services/register-session/session-store';
import { useRegisterSessionCollection } from '../../../../services/register-session/use-register-session-collections';

const ACTIONS_CATEGORY = ['wcpos', 'pos', 'actions'];

export function useActionContext(): { ctx: ActionContext; actor: ActionActor } {
	const runtime = useQueryRuntime();
	const t = useT();
	const { store, wpCredentials, userDB, site } = useStoreSession();
	const sessions = useRegisterSessionCollection();
	const sessionsOn = !!useDocField(store, (value) => value.register_sessions);
	const preventOverselling = useDocField(store, (value) => value.prevent_overselling) === true;
	const userId = wpCredentials.id ?? null;
	const registerId = useRegister()?.id ?? null;
	return React.useMemo(
		() => ({
			ctx: createActionContext({
				// The logger's `error` wants a code the contract does not carry; a hook's row is a warn
				// at most, so the widened call is safe and the type is the only thing in the way.
				log: (level, message, options) => {
					const { category, ...rest } = options ?? {};
					(
						getLogger([...(category ?? ACTIONS_CATEGORY)])[level] as (
							message: string,
							options?: unknown
						) => void
					)(message, rest);
				},
				t,
				readCatalog: async (kind, id) =>
					(await readStockDocument(
						runtime,
						kind === 'product' ? 'products' : 'variations',
						id
					)) as Record<string, unknown> | null,
				preventOverselling,
				// A read, so a guard may call it before `next`: the pre-action write that
				// `requireOpenSession` makes stays with the writer (the tender's bottom handler).
				resolveSession: async () => {
					const registerId = (await readBoundRegister(userDB, site.uuid!, store.id))?.id ?? null;
					const session = await findOpenSession(sessions, registerId, sessionsOn);
					return { registerId, sessionId: session?.id ?? null };
				},
			}),
			actor: { userId, registerId, sessionId: null }, // Stamped when the checkout slice lands.
		}),
		[
			runtime,
			t,
			preventOverselling,
			userId,
			registerId,
			userDB,
			site.uuid,
			store.id,
			sessions,
			sessionsOn,
		]
	);
}
