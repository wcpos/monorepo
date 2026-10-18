import * as React from 'react';

import { useDocField, useQueryRuntime } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';
import { readBoundRegister } from '@wcpos/query/register-session';

import { readStockDocument } from './read-stock-document';
import { usePaymentMethods } from '../../hooks/use-payment-methods';
import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import {
	type ActionActor,
	type ActionContext,
	createActionContext,
} from '../../../../extensions/actions';
import { useRegister } from '../../../../services/register/use-register';
import { findOpenSession } from '../../../../services/register-session/session-store';
import { useRegisterSessionCollection } from '../../../../services/register-session/use-register-session-collections';

const ACTIONS_CATEGORY = ['wcpos', 'pos', 'actions'];

/** The cashier as an audit row names them (the shape `checkout.complete`'s payload carries). */
export type Cashier = { id: string; name: string };

export function useActionContext(): {
	ctx: ActionContext;
	actor: ActionActor;
	cashier: Cashier | null;
} {
	const runtime = useQueryRuntime();
	const t = useT();
	const { store, wpCredentials, userDB, site } = useStoreSession();
	const sessions = useRegisterSessionCollection();
	const sessionsOn = !!useDocField(store, (value) => value.register_sessions);
	const preventOverselling = useDocField(store, (value) => value.prevent_overselling) === true;
	const priceDecimals = useDocField(store, (value) => value.price_num_decimals) ?? 2;
	const userId = wpCredentials.id ?? null;
	const registerId = useRegister()?.id ?? null;
	const { byId: paymentMethods } = usePaymentMethods();
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
				readPaymentMethod: (id) => paymentMethods.get(id) ?? null,
				preventOverselling,
				priceDecimals,
				// A read, so a guard may call it before `next`: the pre-action write that
				// `requireOpenSession` makes stays with the writer (the tender's bottom handler).
				resolveSession: async () => {
					const registerId = (await readBoundRegister(userDB, site.uuid!, store.id))?.id ?? null;
					const session = await findOpenSession(sessions, registerId, sessionsOn);
					return { registerId, sessionId: session?.id ?? null };
				},
			}),
			actor: { userId, registerId, sessionId: null }, // Stamped when the checkout slice lands.
			cashier:
				userId == null
					? null
					: {
							id: String(userId),
							name: wpCredentials.display_name || wpCredentials.username || '',
						},
		}),
		[
			runtime,
			t,
			paymentMethods,
			preventOverselling,
			priceDecimals,
			userId,
			wpCredentials.display_name,
			wpCredentials.username,
			registerId,
			userDB,
			site.uuid,
			store.id,
			sessions,
			sessionsOn,
		]
	);
}
