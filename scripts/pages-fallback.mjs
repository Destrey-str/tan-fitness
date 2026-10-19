import { copyFileSync, existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const index = resolve('dist/index.html')
const fallback = resolve('dist/404.html')
if (!existsSync(index)) {
  console.warn('pages-fallback: dist/index.html missing')
  process.exit(0)
}
copyFileSync(index, fallback)
writeFileSync(resolve('dist/.nojekyll'), '')
console.log('wrote dist/404.html and dist/.nojekyll for GitHub Pages')
