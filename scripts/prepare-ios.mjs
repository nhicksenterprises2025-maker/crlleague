import { cp, mkdir, rm } from 'node:fs/promises';

const assets = [
  'index.html',
  'styles.css',
  'game.js',
  'manifest.webmanifest',
  'sw.js',
  'icon.svg'
];

await rm('www', { recursive: true, force: true });
await mkdir('www', { recursive: true });

for (const asset of assets) {
  await cp(asset, `www/${asset}`);
}

console.log('VECTOR GRID iOS web bundle prepared in ./www');
