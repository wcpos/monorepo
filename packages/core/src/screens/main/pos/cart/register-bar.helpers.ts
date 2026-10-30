export function describeRegisterBar({
	registerName,
	registerCount,
	storeName,
	bindingStatus,
	online,
	directoryFailed = false,
	sessionsOn = false,
	sessionStatus = null,
	overdue = false,
	approvalRequired = false,
	awaitingStore = 0,
}: {
	registerName: string | null;
	registerCount: number;
	storeName: string;
	bindingStatus: 'bound' | 'choose' | 'none' | 'unknown';
	online: boolean;
	directoryFailed?: boolean;
	sessionsOn?: boolean;
	sessionStatus?: string | null;
	overdue?: boolean;
	approvalRequired?: boolean;
	/** Sales taken that the store has still to hear (`useAwaitingStoreCount`). */
	awaitingStore?: number;
}) {
	return {
		// Store · Register: the larger container first, as every line that names both reads.
		place: registerCount > 1 && registerName ? `${storeName} · ${registerName}` : storeName,
		pill:
			bindingStatus === 'choose'
				? ('register.choose_register' as const)
				: bindingStatus === 'none'
					? ('register.no_register' as const)
					: !online || directoryFailed
						? // ADR 0040 Decided 1 rule 1: offline, the pill counts the sales still to send.
							awaitingStore > 0
							? ('register.offline_to_send' as const)
							: ('register.offline' as const)
						: sessionStatus === 'counting' && !approvalRequired
							? ('register.counting' as const)
							: approvalRequired
								? ('register.approval_needed' as const)
								: sessionStatus === 'open' && overdue
									? ('register.overdue' as const)
									: sessionsOn && !sessionStatus
										? ('register.closed' as const)
										: // Online, the sales the store has not answered rank last: they need no action.
											awaitingStore > 0
											? ('register.awaiting_store' as const)
											: null,
	};
}
