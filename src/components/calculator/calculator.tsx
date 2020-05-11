// React Native version of https://codepen.io/mjijackson/pen/xOzyGX
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Display from './display';
import Input from './input';
import Key from './key';

const CalculatorOperations = {
	'/': (prevValue: number, nextValue: number) => prevValue / nextValue,
	'*': (prevValue: number, nextValue: number) => prevValue * nextValue,
	'+': (prevValue: number, nextValue: number) => prevValue + nextValue,
	'-': (prevValue: number, nextValue: number) => prevValue - nextValue,
	'=': (prevValue: number, nextValue: number) => nextValue,
};

interface State {
	value?: number;
	displayValue: string;
	operator?: '/' | '*' | '+' | '-' | '=';
	waitingForOperand: boolean;
}

/**
 * Calculator
 */
class Calculator extends React.Component<{}, State> {
	constructor(props: any, context: any) {
		super(props, context);

		this.state = {
			value: undefined,
			displayValue: '0',
			operator: undefined,
			waitingForOperand: false,
		};
	}

	clearAll() {
		this.setState({
			value: undefined,
			displayValue: '0',
			operator: undefined,
			waitingForOperand: false,
		});
	}

	clearDisplay() {
		this.setState({
			displayValue: '0',
		});
	}

	clearLastChar() {
		const { displayValue } = this.state;

		this.setState({
			displayValue: displayValue.substring(0, displayValue.length - 1) || '0',
		});
	}

	toggleSign() {
		const { displayValue } = this.state;
		const newValue = parseFloat(displayValue) * -1;

		this.setState({
			displayValue: String(newValue),
		});
	}

	inputPercent() {
		const { displayValue } = this.state;
		const currentValue = parseFloat(displayValue);

		if (currentValue === 0) {
			return;
		}

		const fixedDigits = displayValue.replace(/^-?\d*\.?/, '');
		const newValue = parseFloat(displayValue) / 100;

		this.setState({
			displayValue: String(newValue.toFixed(fixedDigits.length + 2)),
		});
	}

	inputDot() {
		const { displayValue } = this.state;

		if (!/\./.test(displayValue)) {
			this.setState({
				displayValue: displayValue + '.',
				waitingForOperand: false,
			});
		}
	}

	inputDigit(digit: number) {
		const { displayValue, waitingForOperand } = this.state;

		if (waitingForOperand) {
			this.setState({
				displayValue: String(digit),
				waitingForOperand: false,
			});
		} else {
			this.setState({
				displayValue: displayValue === '0' ? String(digit) : displayValue + digit,
			});
		}
	}

	performOperation(nextOperator: any) {
		const { value, displayValue, operator } = this.state;
		const inputValue = parseFloat(displayValue);

		if (value == null) {
			this.setState({
				value: inputValue,
			});
		} else if (operator) {
			const currentValue = value || 0;
			const newValue = CalculatorOperations[operator](currentValue, inputValue);

			this.setState({
				value: newValue,
				displayValue: String(newValue),
			});
		}

		this.setState({
			waitingForOperand: true,
			operator: nextOperator,
		});
	}

	handleKeyDown(event: any) {
		let { key } = event;

		if (key === 'Enter') {
			key = '=';
		}

		if (/\d/.test(key)) {
			event.preventDefault();
			this.inputDigit(parseInt(key, 10));
		} else if (key in CalculatorOperations) {
			event.preventDefault();
			this.performOperation(key);
		} else if (key === '.') {
			event.preventDefault();
			this.inputDot();
		} else if (key === '%') {
			event.preventDefault();
			this.inputPercent();
		} else if (key === 'Backspace') {
			event.preventDefault();
			this.clearLastChar();
		} else if (key === 'Clear') {
			event.preventDefault();

			if (this.state.displayValue !== '0') {
				this.clearDisplay();
			} else {
				this.clearAll();
			}
		}
	}

	render() {
		const { displayValue } = this.state;

		const clearDisplay = displayValue !== '0';
		const clearText = clearDisplay ? 'C' : 'AC';

		return (
			<View style={calculatorStyles.root}>
				<Input onKeyDown={(event) => this.handleKeyDown(event)} />
				<Display value={displayValue} />
				<View style={calculatorStyles.keypad}>
					<View style={calculatorStyles.inputKeys}>
						<View style={calculatorStyles.functionKeys}>
							<FunctionKey onPress={() => (clearDisplay ? this.clearDisplay() : this.clearAll())}>
								{clearText}
							</FunctionKey>
							<FunctionKey onPress={() => this.toggleSign()}>±</FunctionKey>
							<FunctionKey onPress={() => this.inputPercent()}>%</FunctionKey>
						</View>
						<View style={calculatorStyles.digitKeys}>
							<DigitKey
								onPress={() => this.inputDigit(0)}
								style={calculatorStyles.key0}
								textStyle={{ textAlign: 'left' }}
							>
								0
							</DigitKey>
							<DigitKey
								onPress={() => this.inputDot()}
								style={calculatorStyles.keyDot}
								textStyle={calculatorStyles.keyDotText}
							>
								.
							</DigitKey>
							<DigitKey onPress={() => this.inputDigit(1)}>1</DigitKey>
							<DigitKey onPress={() => this.inputDigit(2)}>2</DigitKey>
							<DigitKey onPress={() => this.inputDigit(3)}>3</DigitKey>
							<DigitKey onPress={() => this.inputDigit(4)}>4</DigitKey>
							<DigitKey onPress={() => this.inputDigit(5)}>5</DigitKey>
							<DigitKey onPress={() => this.inputDigit(6)}>6</DigitKey>
							<DigitKey onPress={() => this.inputDigit(7)}>7</DigitKey>
							<DigitKey onPress={() => this.inputDigit(8)}>8</DigitKey>
							<DigitKey onPress={() => this.inputDigit(9)}>9</DigitKey>
						</View>
					</View>
					<View style={calculatorStyles.operatorKeys}>
						<OperatorKey onPress={() => this.performOperation('/')}>÷</OperatorKey>
						<OperatorKey onPress={() => this.performOperation('*')}>×</OperatorKey>
						<OperatorKey onPress={() => this.performOperation('-')}>−</OperatorKey>
						<OperatorKey onPress={() => this.performOperation('+')}>+</OperatorKey>
						<OperatorKey onPress={() => this.performOperation('=')}>=</OperatorKey>
					</View>
				</View>
			</View>
		);
	}
}

const DigitKey = (props: any) => (
	<Key
		{...props}
		style={[calculatorStyles.digitKeys, props.style]}
		textStyle={[calculatorStyles.digitKeyText, props.textStyle]}
	/>
);

const FunctionKey = (props: any) => (
	<Key
		{...props}
		style={[calculatorStyles.functionKeys, props.style]}
		textStyle={[calculatorStyles.functionKeyText, props.textStyle]}
	/>
);

const OperatorKey = (props: any) => (
	<Key
		{...props}
		style={[calculatorStyles.operatorKey, props.style]}
		textStyle={[calculatorStyles.operatorKeyText, props.textStyle]}
	/>
);

const calculatorStyles = StyleSheet.create({
	root: {
		width: 320,
		height: 520,
		backgroundColor: 'black',
		boxShadow: '0px 0px 20px 0px #aaa',
	},
	keypad: {
		height: 400,
		flexDirection: 'row',
	},
	inputKeys: {
		width: 240,
	},
	calculatorKeyText: {
		fontFamily: 'Roboto, sans-serif',
		// fontSize: '1.75em',
		fontSize: 1.75,
		fontWeight: '100',
	},
	functionKeys: {
		// backgroundImage: 'linear-gradient(to bottom, rgba(202,202,204,1) 0%, rgba(196,194,204,1) 100%)',
		flexDirection: 'row',
	},
	functionKeyText: {
		fontFamily: 'Roboto, sans-serif',
		// fontSize: '1.75em',
		fontSize: 1.75,
		fontWeight: '100',
	},
	digitKeys: {
		backgroundColor: '#e0e0e7',
		flexDirection: 'row',
		flexWrap: 'wrap-reverse',
	},
	digitKeyText: {
		fontFamily: 'Roboto, sans-serif',
		// fontSize: '2em',
		fontSize: 2,
		fontWeight: '100',
	},
	operatorKeys: {
		// backgroundImage: 'linear-gradient(to bottom, rgba(252,156,23,1) 0%, rgba(247,126,27,1) 100%)',
	},
	operatorKey: {
		borderRightWidth: 0,
	},
	operatorKeyText: {
		color: 'white',
		fontFamily: 'Roboto, sans-serif',
		// fontSize: '2.65em',
		fontSize: 2.65,
		fontWeight: '100',
	},
	keyMultiplyText: {
		lineHeight: 50,
	},
	key0: {
		paddingLeft: 32,
		width: 160,
	},
	keyDot: {
		overflow: 'hidden',
	},
	keyDotText: {
		fontFamily: 'Roboto, sans-serif',
		fontSize: '4.375em',
		fontWeight: '100',
		marginTop: -10,
	},
});

export default Calculator;
