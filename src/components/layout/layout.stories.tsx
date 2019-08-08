import React from 'react';
import { View, Text, ScrollView } from 'react-native';

import { storiesOf } from '@storybook/react';

import Layout from './';

storiesOf('Layout', module)
	/**
	 * Layout
	 */
	.add('basic usage', () => (
		<Layout
			masterbar={
				<View>
					<Text>Header</Text>
				</View>
			}
			main={
				<ScrollView>
					<Text>
						Lorem ipsum dolor sit amet, consectetur adipiscing elit. Aliquam hendrerit, nisi at
						interdum accumsan, lacus eros tristique tortor, quis aliquet turpis eros non odio.
						Suspendisse congue ex vel ipsum congue fringilla. Ut sed est fermentum, pulvinar nisl
						imperdiet, volutpat nisi. Phasellus porttitor ex eu magna sollicitudin ullamcorper.
						Suspendisse et ante vitae felis aliquet suscipit. Phasellus tincidunt lorem elit, vitae
						aliquet urna luctus eu. Duis tempor consequat sem id lacinia. Donec vel mauris ut erat
						efficitur eleifend. Etiam nec tincidunt turpis. Nam tincidunt ultrices lectus nec
						posuere. Nulla facilisi. Sed sit amet commodo dolor, sit amet egestas lacus. Donec
						tellus nunc, faucibus eu tincidunt vitae, consectetur id felis. Integer lacinia congue
						aliquam. Nam suscipit dapibus nunc, non imperdiet neque egestas eget. Maecenas facilisis
						justo sodales tellus efficitur pretium. Fusce nec urna mauris. Cras in mattis diam, in
						pretium enim. Nulla facilisi. Sed rutrum, risus in varius viverra, enim massa sagittis
						est, quis mollis leo est at lorem. Pellentesque convallis enim id ante vulputate, et
						ultrices risus vehicula. Suspendisse malesuada leo diam, vel pharetra elit suscipit eu.
						Nullam lacinia, felis quis rutrum pulvinar, urna ipsum vulputate augue, in rhoncus
						ligula ipsum sed augue. In ac neque in eros gravida eleifend. Sed sit amet erat sit amet
						justo tempus pretium. In vitae lacus aliquet, varius tortor at, blandit velit. Ut porta
						scelerisque magna lobortis porta. Suspendisse rutrum ante sed mauris faucibus rhoncus.
						Phasellus felis enim, ultrices eget faucibus non, semper id sapien. Nunc in magna lacus.
						Proin a sodales leo, et blandit enim. Sed sit amet porttitor purus. Sed viverra urna a
						euismod convallis. Donec finibus quam quis augue condimentum, non placerat felis mollis.
						Nam sagittis est molestie enim congue, eu suscipit risus posuere. Suspendisse eu odio
						vel mauris auctor facilisis id ac diam. Aliquam eu fringilla turpis. Sed fringilla
						interdum dolor eget blandit. Integer eu tortor sed ipsum lobortis rutrum. Integer
						facilisis at elit a scelerisque. Nunc leo ex, maximus et mollis nec, bibendum a tellus.
						In vitae lobortis felis. Nunc auctor ante nibh, non aliquam arcu auctor vitae. Integer
						luctus tortor odio, quis egestas metus bibendum non. Curabitur blandit nulla a ipsum
						aliquet, rhoncus tempus orci rutrum.
					</Text>
				</ScrollView>
			}
		/>
	));
