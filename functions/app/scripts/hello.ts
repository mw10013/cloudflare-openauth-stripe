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
