import * as React from 'react';

import { EmptyState } from '@wcpos/components/empty-state';
import { useDocField } from '@wcpos/query';

import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useRegisterBinding } from '../../../../services/register/use-register-binding';

const REGISTER_DOCS_URL = 'https://docs.wcpos.com/stores/registers-and-devices';

/** The cart column while this store has no register, or its register list could not be read. */
export function RegisterGateCard({ failed }: { failed: boolean }) {
	const t = useT();
	const { retry } = useRegisterBinding();
	const { site, wpCredentials } = useStoreSession();
	const capabilities = useDocField(wpCredentials, (value) => value.capabilities) as
		string[] | undefined;
	const manager = !!capabilities?.includes('manage_woocommerce_pos');
	// wp-admin lives under the WordPress install URL (`site.url`), which differs from `site.home`
	// when WordPress sits in a subdirectory, as the settings' WooCommerce links already do.
	const adminStores = `${String(site.url ?? '').replace(/\/+$/, '')}/wp-admin/edit.php?post_type=wcpos_store`;
	return (
		<EmptyState
			kind="failed"
			icon="register"
			testID="register-gate-card"
			title={t(failed ? 'register.cannot_reach_registers' : 'register.no_register_for_store')}
			description={t(
				failed ? 'register.check_connection_then_try_again' : 'register.manager_adds_one_in_stores'
			)}
			action={{
				label: t('register.try_again'),
				onPress: () => void retry(),
				testID: 'register-gate-retry',
			}}
			docs={
				manager
					? { label: t('register.open_stores'), href: adminStores, testID: 'register-gate-admin' }
					: {
							label: t('register.register_guide'),
							href: REGISTER_DOCS_URL,
							testID: 'register-gate-docs',
						}
			}
		/>
	);
}
