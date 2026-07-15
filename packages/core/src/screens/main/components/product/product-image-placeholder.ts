const PRODUCT_IMAGE_PLACEHOLDER_SVG = `
	<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150" viewBox="0 0 150 150">
		<rect width="150" height="150" fill="#e5e7eb" />
		<rect x="38" y="42" width="74" height="66" rx="5" fill="none" stroke="#9ca3af" stroke-width="6" />
		<circle cx="61" cy="64" r="7" fill="#9ca3af" />
		<path d="m43 99 22-22 15 15 11-11 16 18" fill="none" stroke="#9ca3af" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
	</svg>
`;

export const PRODUCT_IMAGE_PLACEHOLDER = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
	PRODUCT_IMAGE_PLACEHOLDER_SVG
)}`;
