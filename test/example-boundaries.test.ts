// Application source must run without importing JevTest configuration, fixtures, or runner code.
import { readdir, readFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import ts from 'typescript'
import { expect, it } from 'vitest'

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const file = resolve(directory, entry.name)
      return entry.isDirectory() ? sourceFiles(file) : file.endsWith('.ts') ? [file] : []
    }),
  )
  return files.flat()
}

it.each(['ledger', 'reservations', 'taskboard', 'shop', 'repairworks'])(
  '%s application source has no dependency on evaluation code',
  async (app) => {
    const root = resolve('examples', app, 'src')
    const files = await sourceFiles(root)
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest)
      const check = (specifier: ts.Expression) => {
        expect(ts.isStringLiteral(specifier), `${file}: dependency must be explicit`).toBe(true)
        if (!ts.isStringLiteral(specifier)) return
        const name = specifier.text
        if (!name.startsWith('.')) {
          expect(name, `${file}: application imports JevTest`).not.toMatch(/jevtest/i)
          expect(isAbsolute(name), `${file}: absolute dependency`).toBe(false)
          return
        }
        const dependency = resolve(file, '..', name.replace(/\.js$/, '.ts'))
        const local = relative(root, dependency)
        expect(local.startsWith('..') || isAbsolute(local), `${file}: ${name} leaves src/`).toBe(
          false,
        )
        expect(files, `${file}: unresolved source dependency ${name}`).toContain(dependency)
      }
      const visit = (node: ts.Node) => {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier)
          check(node.moduleSpecifier)
        if (
          ts.isCallExpression(node) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
          node.arguments[0]
        )
          check(node.arguments[0])
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
  },
)
