import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const imagePath = new URL('./hero.jpg', import.meta.url);
const hero = existsSync(imagePath) ? readFileSync(imagePath).toString('base64') : '';
const banner = readFileSync(new URL('./banner-fontenele.jpg', import.meta.url)).toString('base64');
const menuPhotosDir = new URL('./fotos-exemplo/', import.meta.url);
const photos = Object.fromEntries(readdirSync(menuPhotosDir).filter(name => name.endsWith('.jpg')).map(name => [
  '/fotos-exemplo/' + name, readFileSync(new URL(name, menuPhotosDir)).toString('base64'),
]));
const assets = {
  '/gestao/login': read('./gestao-login.html'),
  '/': read('./index.html'), '/style.css': read('./style.css'), '/loja.css': read('./loja.css'), '/app.js': read('./app.js'),
  '/gestao': read('./gestao.html'), '/gestao.js': read('./gestao.js'), '/gestao.css': read('./gestao.css'),
};
mkdirSync(new URL('./dist/server/', import.meta.url), { recursive: true });
writeFileSync(new URL('./dist/server/index.js', import.meta.url),
  `const ASSETS = ${JSON.stringify(assets)};\nconst MENU_PHOTOS = ${JSON.stringify({'/hero.jpg':hero,'/banner-fontenele.jpg':banner,...photos})};\n${read('./worker.js')}`);
