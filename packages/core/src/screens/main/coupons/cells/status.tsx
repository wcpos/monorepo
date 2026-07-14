import { useObservableEagerState } from 'observable-hooks';

import { ButtonPill, ButtonText } from '@wcpos/components/button';

import { useT } from '../../../../contexts/translations';

import type { QueryStateActions } from '../../../../query';
import type { CellContext } from '@tanstack/react-table';

type CouponDocument = import('@wcpos/database').CouponDocument;

const labelMap: Record<string, string> = {
	publish: 'coupons.publish',
	draft: 'coupons.draft',
	pending: 'coupons.pending',
};

export function Status({ row, table }: CellContext<{ document: CouponDocument }, 'status'>) {
	const coupon = row.original.document;
	const status = useObservableEagerState(coupon.status$!) as string;
	const t = useT();
	const actions = (
		table.options.meta as {
			actions?: Pick<QueryStateActions<'coupons'>, 'setFilter'>;
		}
	)?.actions;

	const label = labelMap[status] ? t(labelMap[status]) : status;

	return (
		<ButtonPill
			variant="ghost-primary"
			size="xs"
			onPress={() => status && actions?.setFilter('status', status)}
		>
			<ButtonText numberOfLines={1}>{label}</ButtonText>
		</ButtonPill>
	);
}
