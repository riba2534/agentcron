// build.mjs — bundle cct-runner into a single ESM file for runtime execution.
// Why bundle: workspace packages publish `./src/*.ts` as `main`, so consumers
// either need a TS-aware Node loader (tsx) or a bundler. We bundle so the
// shipped bin runs under plain `node dist/index.js`.
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outdir = path.join(here, 'dist');
await mkdir(outdir, { recursive: true });

await build({
  entryPoints: [path.join(here, 'src/index.ts')],
  outfile: path.join(outdir, 'index.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: false,
  banner: {
    // require() shim so bundled CJS deps (e.g. @prisma/client) keep working in ESM.
    // The shebang is already emitted by esbuild because src/index.ts begins with `#!/usr/bin/env node`.
    js: [
      "import { createRequire as __cctCreateRequire } from 'node:module';",
      'const require = __cctCreateRequire(import.meta.url);',
    ].join('\n'),
  },
  // 不内联 prisma engines（二进制），让运行时从 node_modules 解析。
  external: ['@prisma/client', 'prisma'],
  logLevel: 'info',
});
