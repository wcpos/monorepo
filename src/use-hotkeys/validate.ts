/**
 *
 */
export function isAlphaNumeric(str: string) {
	const regex = new RegExp(`^[a-zA-Z0-9]$`);
	return regex.test(str);
}
