export interface JSON {
	id?: number;
	customer_id?: number;
	first_name?: string;
	last_name?: string;
	username?: string;
	email?: string;
	billing?: {
		first_name?: string;
		last_name?: string;
		username?: string;
		email?: string;
	};
	shipping?: {
		first_name?: string;
		last_name?: string;
	};
}

function getTrimmedValue(value?: string): string {
	return value?.trim() || '';
}

function extractFullName(firstName: string, lastName: string): string {
	if (firstName && lastName) {
		return `${firstName} ${lastName}`;
	} else if (firstName || lastName) {
		return firstName || lastName;
	}
	return '';
}

export function extractNameFromJSON(json: JSON) {
	const firstName = getTrimmedValue(json.first_name);
	const lastName = getTrimmedValue(json.last_name);

	const fullName = extractFullName(firstName, lastName);
	if (fullName) return fullName;

	const billingFirstName = getTrimmedValue(json.billing?.first_name);
	const billingLastName = getTrimmedValue(json.billing?.last_name);

	const billingFullName = extractFullName(billingFirstName, billingLastName);
	if (billingFullName) return billingFullName;

	const shippingFirstName = getTrimmedValue(json.shipping?.first_name);
	const shippingLastName = getTrimmedValue(json.shipping?.last_name);

	const shippingFullName = extractFullName(shippingFirstName, shippingLastName);
	if (shippingFullName) return shippingFullName;

	const username = getTrimmedValue(json.username) || getTrimmedValue(json.billing?.username);
	if (username) return username;

	const email = getTrimmedValue(json.email) || getTrimmedValue(json.billing?.email);
	if (email) return email;

	return '';
}
