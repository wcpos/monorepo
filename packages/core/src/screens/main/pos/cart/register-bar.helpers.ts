export function describeRegisterBar({
	registerName,
	registerCount,
	storeName,
	bindingStatus,
	online,
	sessionsOn = false,
	sessionStatus = null,
	overdue = false,
}: {
	registerName: string | null;
	registerCount: number;
	storeName: string;
	bindingStatus: 'bound' | 'choose' | 'none' | 'unknown';
	online: boolean;
	sessionsOn?: boolean;
	sessionStatus?: string | null;
	overdue?: boolean;
}) {
	return {
		place: registerCount > 1 && registerName ? `${registerName} · ${storeName}` : storeName,
		pill:
			bindingStatus === 'choose'
				? ('register.choose_register' as const)
				: !online
					? ('register.offline' as const)
					: sessionStatus === 'counting'
						? ('register.counting' as const)
						: sessionStatus === 'open' && overdue
							? ('register.overdue' as const)
							: sessionsOn && !sessionStatus
								? ('register.closed' as const)
								: null,
	};
}
