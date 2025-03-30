/**
 * @see https://prettier.io/docs/en/configuration.html
 * @type {import("prettier").Config}
 */
const config = {
	// bracketSameLine: true,
	printWidth: 140,
	semi: false,
	singleQuote: true,
	trailingComma: 'none', // None needed for .jsonc
	// useTabs: true,

	// https://github.com/IanVS/prettier-plugin-sort-imports
	importOrder: ['<TYPES>^(node:)', '<TYPES>', '<TYPES>^[.]', '^(react/(.*)$)|^(react$)', '<THIRD_PARTY_MODULES>', '^~/(.*)$', '^[./]'],
	importOrderParserPlugins: ['typescript', 'jsx', 'decorators-legacy'],
	importOrderTypeScriptVersion: '5.8.2',

	// https://github.com/tailwindlabs/prettier-plugin-tailwindcss?tab=readme-ov-file#specifying-your-tailwind-stylesheet-path
	tailwindStylesheet: 'src/tailwind.css',
	// https://github.com/tailwindlabs/prettier-plugin-tailwindcss?tab=readme-ov-file#sorting-classes-in-function-calls
	tailwindFunctions: ['tv', 'composeTailwindRenderProps'],

	plugins: [
		'prettier-plugin-sql',
		'@ianvs/prettier-plugin-sort-imports',
		// https://github.com/tailwindlabs/prettier-plugin-tailwindcss?tab=readme-ov-file#compatibility-with-other-prettier-plugins
		'prettier-plugin-tailwindcss' // MUST come last
	],
	overrides: [
		{
			files: ['*.sql'],
			// https://github.com/un-ts/prettier/tree/master/packages/sql#parser-options
			options: {
				language: 'sqlite',
				keywordCase: 'lower'
			}
		}
	]
}

export default config
