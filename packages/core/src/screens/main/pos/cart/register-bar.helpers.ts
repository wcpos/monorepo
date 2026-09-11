export function describeRegisterBar({
	registerName,
	registerCount,
	storeName,
	bindingStatus,
	online,
}: {
	registerName: string | null;
	registerCount: number;
	storeName: string;
	bindingStatus: 'bound' | 'choose' | 'none' | 'unknown';
	online: boolean;
}) {
	return {
		place: registerCount > 1 && registerName ? `${registerName} · ${storeName}` : storeName,
		pill:
			bindingStatus === 'choose'
				? ('register.choose_register' as const)
				: !online
					? ('register.offline' as const)
					: null,
	};
}
