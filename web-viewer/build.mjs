// Bundle the React web-viewer and its Node host independently of the JevTest engine build.
import { build } from 'esbuild'
import { mkdir, copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
await mkdir(new URL('../dist/web-viewer/public/', import.meta.url), { recursive: true })
await build({
  absWorkingDir: root,
  entryPoints: ['web-viewer/client/main.tsx'],
  outfile: 'dist/web-viewer/public/viewer.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  metafile: true,
}).then((result) => {
  const serverImports = Object.keys(result.metafile.inputs).filter(
    (path) => path.startsWith('src/') || path.startsWith('web-viewer/server/'),
  )
  if (serverImports.length)
    throw new Error(
      'The React bundle must not include engine or server code: ' + serverImports.join(', '),
    )
})
await build({
  absWorkingDir: root,
  entryPoints: ['web-viewer/server/command.ts'],
  outfile: 'dist/web-viewer/command.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node24',
  packages: 'external',
})
await copyFile(
  new URL('./index.html', import.meta.url),
  new URL('../dist/web-viewer/public/index.html', import.meta.url),
)
console.log('Built React viewer and local host in dist/web-viewer/.')
