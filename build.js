// Minimal esbuild bundler to produce a split JS bundle for the app.
const esbuild = require('esbuild');
const path = require('path');

esbuild.build({
  entryPoints: ['assets/js/app.js'],
  bundle: true,
  minify: true,
  sourcemap: false,
  splitting: true,
  format: 'esm',
  outdir: 'assets/dist',
  publicPath: '/assets/dist',
  target: ['es2018'],
  logLevel: 'info'
}).catch(() => process.exit(1));
