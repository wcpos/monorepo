// rxdb-premium optimistically inserts, then handles ON CONFLICT with an update (#2334).
// Suppress only those recovered INSERT constraint warnings.
export function quietRecoveredConstraintWarnings(sqlite3) {
	const warn = sqlite3.config.warn;
	sqlite3.config.warn = (...args) => {
		if (
			args[0] === 'sqlite3_step() rc=' &&
			(args[1] === 1555 || args[1] === 2067) &&
			/^\s*INSERT\b/i.test(String(args[4]))
		) {
			return;
		}
		warn(...args);
	};
}
