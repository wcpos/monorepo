const handleKeyPress = React.useCallback(
		(e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
			let shouldReplace = false;
			if (localRef.current) {
				const webInput = localRef.current as unknown as HTMLInputElement | undefined;
				if (webInput?.selectionStart !== undefined) {
					shouldReplace = webInput.selectionStart === 0;
				}
			}
			const key = e.nativeEvent.key;
			switch (key) {
				case 'Backspace':
					deleteDigit();
					break;
				case decimalSeparator:
					addDigit('.', shouldReplace);
					break;
				default:
					if (/^[0-9]$/.test(key)) {
						addDigit(key, shouldReplace);
					}
			}
		},
		[deleteDigit, decimalSeparator, addDigit]
	);

	/**
	 *
	 */
	const handleButtonPress = React.useCallback(
		(key: string) => {
			let shouldReplace = false;
			if (localRef.current) {
				const webInput = localRef.current as unknown as HTMLInputElement | undefined;
				if (webInput?.selectionStart !== undefined) {
					shouldReplace = webInput.selectionStart === 0;
				}
			}
			switch (key) {
				case '+/-':
					switchSign();
					break;
				case decimalSeparator:
					addDigit('.', shouldReplace);
					break;
				default:
					addDigit(key, shouldReplace);
			}
			// after a button press, we want to focus the input
			if (localRef.current) {
				localRef.current?.focus();
				const webInput = localRef.current as unknown as HTMLInputElement | undefined;
				webInput?.setSelectionRange?.(100, 100);
			}
		},
		[addDigit, decimalSeparator, switchSign]
	);