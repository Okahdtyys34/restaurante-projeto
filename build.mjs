import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const imagePath = new URL('./hero.jpg', import.meta.url);
const hero = existsSync(imagePath) ? readFileSync(imagePath).toString('base64') : '';
const assets = {
  '/gestao/login': read('./gestao-login.html'),
  '/': read('./index.html'), '/style.css': read('./style.css'), '/app.js': read('./app.js'),
  '/gestao': read('./gestao.html'), '/gestao.js': read('./gestao.js'), '/gestao.css': read('./gestao.css'),
};
mkdirSync(new URL('./dist/server/', import.meta.url), { recursive: true });
writeFileSync(new URL('./dist/server/index.js', import.meta.url),
  `const ASSETS = ${JSON.stringify(assets)};\nconst HERO = ${JSON.stringify(hero)};\n${read('./worker.js')}`);
