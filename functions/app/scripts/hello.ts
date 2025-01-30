import 'zx/globals'
import * as jsonc from 'jsonc-parser'
import { $, fs } from 'zx'


const env = argv.env || 'local'
console.log({ argv: argv, env })

const wranglerJsonc = await fs.readFile('wrangler.jsonc', 'utf-8')
// const wranglerJson = jsonc.stripComments(wranglerJsonc)
// const wrangler = JSON.parse(wranglerJson)

// console.log({ wranglerJsonc, wranglerJson, wrangler })
// console.dir(wrangler, { depth: null })

const wrangler = jsonc.parse(wranglerJsonc)
console.dir(wrangler, { depth: null })

const wranglerJsoncModified = modifyJsonc(wranglerJsonc)
console.log({ wranglerJsoncModified })

function modifyJsonc(jsoncContent: string) {
	const parsed = jsonc.parseTree(jsoncContent)
	if (!parsed) {
		throw new Error('Failed to parse JSONC')
	}

	// Find the path to the database_id in production environment
	const productionPath = ['env', 'production', 'd1_databases', 0, 'database_id']
	const node = jsonc.findNodeAtLocation(parsed, productionPath)

	if (node) {
		// Modify the value
		const edit = jsonc.modify(jsoncContent, productionPath, '<DATABASE-ID>', {})
		if (edit) {
			return jsonc.applyEdits(jsoncContent, edit)
		}
	}

	// If we can't find or modify the node, just return the original content
	return jsoncContent
}
