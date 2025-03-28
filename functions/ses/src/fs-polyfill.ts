import * as unenv from 'unenv'
import { promises as fsPromises } from 'unenv/runtime/node/fs/promises'
import * as fs from 'unenv/runtime/node/internal/fs/fs'

// Override promises.readFile to return ENOENT instead of "not implemented"
const promises = {
	...fsPromises,
	readFile: (path: string) => {
		console.log(`[unenv override] fs.promises.readFile: ${path}`)
		const error = new Error(`ENOENT: no such file or directory, open '${path}'`)
		error.code = 'ENOENT'
		error.errno = -2
		error.path = path
		error.syscall = 'open'
		return Promise.reject(error)
	}
}

// Create custom readFile function that returns ENOENT
function readFile(path: string, options: any, callback?: Function): any {
	console.log(`[unenv override] fs.readFile: ${path}`)
	if (typeof options === 'function') {
		callback = options
		options = undefined
	}

	const error = new Error(`ENOENT: no such file or directory, open '${path}'`)
	error.code = 'ENOENT'
	error.errno = -2
	error.path = path
	error.syscall = 'open'

	if (callback) {
		callback(error)
		return
	}

	return promises.readFile(path, options)
}

// Export a merged module
export default {
	...fs,
	promises,
	readFile
}

// Also export individual functions
export { promises, readFile }
export const readFileSync = fs.readFileSync
export const existsSync = fs.existsSync || (() => false)
