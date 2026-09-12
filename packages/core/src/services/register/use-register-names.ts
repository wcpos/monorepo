import * as React from 'react';

import { useRegisterBinding } from './use-register-binding';

export function useRegisterNames(): Record<string, string> {
	const { registers } = useRegisterBinding();
	return React.useMemo(
		() => Object.fromEntries(registers.map(({ id, name }) => [id, name])),
		[registers]
	);
}
