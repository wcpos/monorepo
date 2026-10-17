// PROTOTYPE (roadmap#442) — throwaway, never merge.
import { Slot, useGlobalSearchParams } from 'expo-router';

import { PrototypeScreenError } from '../../../../components/prototype-screen-error';

export default function ReportsLayout() {
	const { variant } = useGlobalSearchParams<{ variant?: string }>();
	if (variant === 'a' || variant === 'b' || variant === 'c') {
		return <PrototypeScreenError variant={variant} />;
	}
	return <Slot />;
}
