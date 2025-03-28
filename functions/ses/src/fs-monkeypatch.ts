import * as fs from 'fs'

const originalReadFile = fs.readFile
const originalPromisesReadFile = fs.promises?.readFile

const patchedFs = {
	...fs,
	readFile: function (...args) {
		console.log('Patched fs.readFile called with:', args[0])
		return originalReadFile.apply(this, args)
	},
	promises: {
		...fs.promises,
		readFile: function (...args) {
			console.log('Patched fs.promises.readFile called with:', args[0])
			return originalPromisesReadFile.apply(this, args)
		}
	}
}

// @ts-ignore
globalThis.fs = patchedFs

console.log('fs monkey patching complete')

export { patchedFs }
