const codeLowerCaseA = 65;
const codeUpperCaseZ = 122;

export const isKeyFromGivenList = (keyCode: string, allowedKeys: string[] = []) => {
	if (allowedKeys === null || allowedKeys.includes(keyCode) || allowedKeys.length === 0) {
		return true;
	}
	return false;
};

export const onKeyPress = (currentKeyCode: string, callback: any, allowedKeys: string[]) => {
	if (isKeyFromGivenList(currentKeyCode, allowedKeys)) {
		callback(currentKeyCode);
	}
};

export function getAsciiCode(event: any) {
	let keyCode = event.which;
	if (keyCode >= codeLowerCaseA && keyCode <= codeUpperCaseZ) {
		keyCode = event.key.charCodeAt(0);
	}
	return keyCode;
}

export function convertToAsciiEquivalent(inputArray: string[]) {
	return inputArray.map((item) => {
		let finalVal = item;
		if (typeof item === 'string') {
			// @ts-ignore
			finalVal = finalVal.charCodeAt(0);
		}
		return finalVal;
	});
}
