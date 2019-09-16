const codeLowerCaseA = 65;
const codeUpperCaseZ = 122;

export const isKeyFromGivenList = (keyCode, allowedKeys = []) => {
	if (allowedKeys === null || allowedKeys.includes(keyCode) || allowedKeys.length === 0) {
		return true;
	}
	return false;
};

export const onKeyPress = (currentKeyCode, callback, allowedKeys) => {
	if (isKeyFromGivenList(currentKeyCode, allowedKeys)) {
		callback(currentKeyCode);
	}
};

export function getAsciiCode(event) {
	let keyCode = event.which;
	if (keyCode >= codeLowerCaseA && keyCode <= codeUpperCaseZ) {
		keyCode = event.key.charCodeAt(0);
	}
	return keyCode;
}

export function convertToAsciiEquivalent(inputArray) {
	return inputArray.map(item => {
		let finalVal = item;
		if (typeof item === 'string') {
			finalVal = finalVal.charCodeAt(0);
		}
		return finalVal;
	});
}
