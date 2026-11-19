const categories = ['Pratos', 'Bebidas', 'Sobremesas'];
const orderMenuItems = items => [...items].sort((left, right) =>
  categories.indexOf(left.category) - categories.indexOf(right.category));
const demo = { phone: '', fee: 500, day: '', items: [
  {name:'Feijoada da casa', description:'Feijão preto, arroz soltinho, couve refogada e farofa crocante.', category:'Pratos', price:2800},
  {name:'Frango grelhado', description:'Filé temperado na casa, com arroz, feijão e salada.', category:'Pratos', price:2200},
  {name:'Bife acebolado', description:'Bife na chapa com cebola dourada, arroz e feijão.', category:'Pratos', price:2500},
  {name:'Prato vegetariano', description:'Legumes assados, arroz, feijão e salada da estação.', category:'Pratos', price:2300},
  {name:'Suco natural', description:'Suco da fruta, preparado na hora.', category:'Bebidas', price:800},
  {name:'Refrigerante em lata', description:'Lata de 350 ml.', category:'Bebidas', price:600},
  {name:'Pudim da família', description:'Pudim de leite com calda de caramelo.', category:'Sobremesas', price:900},
]};
const clock = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'});
const today = () => clock.format(new Date());
const json = (data,status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const examplePhotos = {
  'Feijoada da casa': '/fotos-exemplo/feijoada.jpg',
  'Frango grelhado': '/fotos-exemplo/frango-grelhado.jpg',
  'Bife acebolado': '/fotos-exemplo/bife-acebolado.jpg',
  'Prato vegetariano': '/fotos-exemplo/prato-vegetariano.jpg',
  'Suco natural': '/fotos-exemplo/suco-natural.jpg',
  'Refrigerante em lata': '/fotos-exemplo/refrigerante-em-lata.jpg',
};

function withMenuPhoto(item) {
  const key = value => value.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const match = Object.entries(examplePhotos).find(([name]) => key(name) === key(item.name));
  const imageUrl = match?.[1];
  return imageUrl && Object.hasOwn(MENU_PHOTOS,imageUrl) ? {...item,imageUrl} : item;
}

function exampleMenu() {
  const items = demo.items.map(item => {
    const imageUrl = examplePhotos[item.name];
    const example = item.name === 'Feijoada da casa'
      ? {...item, addons:[{name:'Porção de cebola',price:200}]}
      : {...item};
    if (imageUrl && Object.hasOwn(MENU_PHOTOS,imageUrl)) example.imageUrl = imageUrl;
    return example;
  });
  return json({...demo,items:orderMenuItems(items),demo:true,presentation:true,revision:0,today:today()});
}
const encode = new TextEncoder();
const loginPage = '/gestao/login';
const sessionName = '__Host-familia-gestao';
const sessionSeconds = 8 * 60 * 60;
const photoMaxBytes = 36 * 1024;
const adminMaxBytes = 2200000;

function cookie(value, maxAge) {
  return `${sessionName}=${value}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Strict`;
}

function redirect(location, session) {
  const headers = {'Location':location,'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'};
  if (session) headers['Set-Cookie'] = session;
  return new Response(null,{status:303,headers});
}

const importKey = value => crypto.subtle.importKey('raw',encode.encode(value),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encode.encode(value))),
  byte => byte.toString(16).padStart(2,'0')).join('');

async function authenticated(request, env) {
  const token = request.headers.get('cookie')?.match(/(?:^|;\s*)__Host-familia-gestao=([^;]*)/)?.[1];
  const parts = /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(token ?? '');
  if (!parts || Number(parts[1]) <= Date.now() / 1000) return false;
  const signature = Uint8Array.from(atob(parts[2].replaceAll('-','+').replaceAll('_','/')), c => c.charCodeAt(0));
  return crypto.subtle.verify('HMAC',await importKey(env.ADMIN_SESSION_KEY),signature,encode.encode(`${env.ADMIN_PASSWORD_HASH}:${parts[1]}`));
}

async function signIn(request, env, url) {
  if (request.headers.get('origin') !== url.origin ||
      request.headers.get('content-type')?.split(';')[0] !== 'application/x-www-form-urlencoded') {
    return json({error:'Solicitação inválida.'},403);
  }
  const raw = await request.text();
  if (raw.length > 2048) return json({error:'Dados acima do limite.'},413);
  const values = new URLSearchParams(raw);
  const key = await importKey(env.ADMIN_SESSION_KEY);
  const passwordHash = await digest(values.get('password') ?? '');
  const candidate = await crypto.subtle.sign('HMAC',key,encode.encode(`login:${passwordHash}`));
  const correct = await crypto.subtle.verify('HMAC',key,candidate,encode.encode(`login:${env.ADMIN_PASSWORD_HASH}`));
  if (!correct || values.get('username')?.trim() !== 'dono') return redirect(`${loginPage}?erro=1`);
  const expires = Math.floor(Date.now() / 1000) + sessionSeconds;
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC',key,encode.encode(`${env.ADMIN_PASSWORD_HASH}:${expires}`)));
  const encoded = btoa(String.fromCharCode(...signature)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  return redirect('/gestao',cookie(`${expires}.${encoded}`,sessionSeconds));
}

async function readAdminBody(request) {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  for (;;) {
    const {done, value} = await reader.read();
    if (done) return text + decoder.decode();
    size += value.byteLength;
    if (size > adminMaxBytes) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, {stream:true});
  }
}

async function cleanPhoto(value, previous, index) {
  if (value === undefined) return previous?.photo ? {photo:previous.photo, photoId:previous.photoId} : {};
  if (value === '') return {};
  if (typeof value !== 'string' || value.length > Math.ceil(photoMaxBytes / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error('Confira a foto do item ' + (index + 1) + '.');
  }
  const bytes = atob(value);
  if (!bytes.startsWith('\xff\xd8\xff') || !bytes.endsWith('\xff\xd9')) {
    throw new Error('A foto do item ' + (index + 1) + ' precisa estar em formato JPEG.');
  }
  return {photo:value, photoId:previous?.photo === value && previous.photoId ? previous.photoId : await digest(value)};
}

function cleanAddons(addons, previous, index) {
  if (addons === undefined) return previous?.addons ?? [];
  if (!Array.isArray(addons) || addons.length > 10) throw new Error(`O item ${index + 1} pode ter até 10 adicionais.`);
  const names = new Set();
  return addons.map(addon => {
    const name = typeof addon?.name === 'string' ? addon.name.trim() : '';
    const key = name.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/\p{Diacritic}/gu, '');
    if (!name || name.length > 60 || /[\x00-\x1f\x7f]/.test(name) || names.has(key) ||
        !Number.isInteger(addon.price) || addon.price < 0 || addon.price > 999999) {
      throw new Error(`Confira os nomes e os preços dos adicionais do item ${index + 1}.`);
    }
    names.add(key);
    return {name, price:addon.price};
  });
}

async function clean(data, current) {
  const phone = typeof data.phone === 'string' ? data.phone.replace(/\D/g,'') : '';
  if (phone && !/^55[1-9]\d[2-9]\d{7,8}$/.test(phone)) throw new Error('Informe o WhatsApp com +55, DDD e número.');
  if (!Number.isInteger(data.fee) || data.fee < 0 || data.fee > 99999) throw new Error('Confira a taxa de entrega.');
  if (!['publish','contact'].includes(data.action)) throw new Error('Ação inválida.');
  if (data.action === 'contact') {
    const waitMinutes = data.waitMinutes === undefined ? (current.waitMinutes ?? null) : data.waitMinutes;
    const pixKey = data.pixKey === undefined ? (current.pixKey ?? '') : data.pixKey;
    if (waitMinutes !== null && (!Number.isInteger(waitMinutes) || waitMinutes < 1 || waitMinutes > 600)) throw new Error('Informe uma espera de 1 a 600 minutos.');
    if (typeof pixKey !== 'string' || pixKey.length > 100 || /[\x00-\x1f\x7f]/.test(pixKey)) throw new Error('Informe uma chave Pix de até 100 caracteres.');
    return { ...current, phone, fee: data.fee, waitMinutes, pixKey:pixKey.trim() };
  }
  if (!Array.isArray(data.items) || data.items.length < 1 || data.items.length > 20) throw new Error('Inclua de 1 a 20 itens.');
  const names = new Set();
  const previous = new Map(current.items.map(item => [item.name.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/\p{Diacritic}/gu,''), item]));
  const items = await Promise.all(data.items.map(async (item, index) => {
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    const description = typeof item?.description === 'string' ? item.description.trim() : '';
    const key = name.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/\p{Diacritic}/gu,'');
    if (!name || name.length > 70 || description.length > 160 || names.has(key) ||
        !categories.includes(item.category) || !Number.isInteger(item.price) || item.price < 1 || item.price > 999999) {
      throw new Error(`Confira o nome, a categoria e o preço do item ${index + 1}.`);
    }
    names.add(key);
    const existing = previous.get(key);
    const originalPrice = item.originalPrice === undefined ? (existing?.originalPrice ?? null) : item.originalPrice;
    const bundle = item.bundle === undefined ? (existing?.bundle ?? []) : item.bundle;
    if (originalPrice !== null && (!Number.isInteger(originalPrice) || originalPrice <= item.price || originalPrice > 999999)) throw new Error('Confira o preço antigo do item ' + (index + 1) + '.');
    if (!Array.isArray(bundle) || bundle.length > 10 || bundle.some(line=>typeof line !== 'string' || !line.trim() || line.length > 100 || /[\x00-\x1f\x7f]/.test(line))) throw new Error('Confira os itens do combo ' + (index + 1) + '.');
    const addons = cleanAddons(item.addons, existing, index);
    const offerPhoto = await cleanPhoto(item.promotionPhoto, {photo:existing?.promotionPhoto,photoId:existing?.promotionPhotoId}, index);
    return { name, description, category: item.category, price: item.price, originalPrice, bundle:bundle.map(line=>line.trim()), addons,
      promotionPhoto:offerPhoto.photo ?? '', promotionPhotoId:offerPhoto.photoId ?? '',
      ...await cleanPhoto(item.photo, existing, index) };
  }));
  return { ...current, phone, fee: data.fee, items, day: today() };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const isManagementAsset = ['/gestao','/gestao.js','/gestao.css'].includes(path);
    const identity = request.headers.get('oai-authenticated-user-id');
    const hasPassword = /^[a-f0-9]{64}$/.test(env.ADMIN_PASSWORD_HASH ?? '') && (env.ADMIN_SESSION_KEY?.length ?? 0) >= 32;
    if (path === loginPage && request.method === 'POST') {
      return hasPassword ? await signIn(request,env,url) : json({error:'Login em configuração.'},503);
    }
    if (path === '/gestao/sair' && request.method === 'POST') {
      if (request.headers.get('origin') !== url.origin) return json({error:'Solicitação inválida.'},403);
      return redirect(loginPage,cookie('',0));
    }
    let adminSession = false;
    if (isManagementAsset || path === '/api/admin') {
      if (hasPassword) {
        adminSession = await authenticated(request,env);
        if (!adminSession) {
          return path === '/gestao' ? redirect(loginPage) : json({error:'Entre com usuário e senha.'},401);
        }
      } else {
        if (!identity && path === '/gestao') return redirect('/signin-with-chatgpt?return_to=%2Fgestao');
        if (!identity) return json({error:'Entre com a conta responsável pelo site.'},401);
        const admin = env.ADMIN_EMAIL?.trim().toLowerCase();
        if (!admin || request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase() !== admin) {
          return json({error:'Esta área é reservada à conta responsável pelo restaurante.'},403);
        }
      }
    }
    if (request.method === 'GET' && Object.hasOwn(MENU_PHOTOS,path) && MENU_PHOTOS[path]) {
      return new Response(Uint8Array.from(atob(MENU_PHOTOS[path]), char => char.charCodeAt(0)), {headers:{'Content-Type':'image/jpeg','Cache-Control':'public, max-age=86400'}});
    }
    if (request.method === 'GET' && Object.hasOwn(ASSETS,path)) {
      const type = path.endsWith('.css') ? 'text/css' : path.endsWith('.js') ? 'text/javascript' : 'text/html';
      const privatePage = isManagementAsset || path === loginPage;
      const asset = path === loginPage ? ASSETS[path].replace('<!--LOGIN_ERROR-->',
        url.searchParams.get('erro') === '1' ? '<p class="feedback" role="alert">Usuário ou senha incorretos.</p>' : '') : ASSETS[path];
      return new Response(asset,{headers:{'Content-Type':`${type}; charset=utf-8`,'Cache-Control':privatePage?'no-store':'no-cache',
        ...(privatePage?{'X-Robots-Tag':'noindex, nofollow'}:{}),
        'Content-Security-Policy':path === '/audio-order-worker.js'
          ? "default-src 'none'; script-src https://cdn.jsdelivr.net blob: 'wasm-unsafe-eval'; connect-src https://cdn.jsdelivr.net https://huggingface.co https://*.huggingface.co https://*.hf.co"
          : "default-src 'self'; img-src 'self'" + (path === '/gestao' ? ' data: blob:' : '') +
            (path === '/' ? "; media-src 'self' blob:" : '') +
            "; style-src 'self'; script-src 'self'; form-action 'self'; base-uri 'none'" + (privatePage ? "; frame-ancestors 'none'" : ''),'Referrer-Policy':privatePage ? 'same-origin' : 'no-referrer'}});
    }
    const imageId = request.method === 'GET' && /^\/fotos\/([a-f0-9]{64})\.jpg$/.exec(path)?.[1];
    if (request.method === 'GET' && path === '/api/menu' && url.searchParams.get('apresentacao') === '1') return exampleMenu();
    if (!imageId && !['/api/menu','/api/admin'].includes(path)) return json({error:'Página não encontrada.'},404);
    try {
      if (imageId) {
        const image = await env.DB.prepare("SELECT json_extract(item.value, '$.photo') AS photo FROM restaurant, json_each(settings, '$.items') AS item WHERE restaurant.id = 1 AND json_extract(item.value, '$.photoId') = ? UNION ALL SELECT json_extract(item.value, '$.promotionPhoto') AS photo FROM restaurant, json_each(settings, '$.items') AS item WHERE restaurant.id = 1 AND json_extract(item.value, '$.promotionPhotoId') = ?").bind(imageId,imageId).first();
        if (!image?.photo) return json({error:'Foto não encontrada.'},404);
        return new Response(Uint8Array.from(atob(image.photo), character => character.charCodeAt(0)), {
          headers:{'Content-Type':'image/jpeg','Cache-Control':'public, max-age=86400, immutable','X-Content-Type-Options':'nosniff'},
        });
      }
      const row = await env.DB.prepare('SELECT owner, settings, revision FROM restaurant WHERE id = 1').first();
      const settings = row ? JSON.parse(row.settings) : demo;
      const revision = row?.revision ?? 0;
      if (path === '/api/menu' && request.method === 'GET') {
        const active = !settings.day || settings.day === today();
        const items = active ? settings.items.map(({photo, photoId, promotionPhoto, promotionPhotoId, ...item}) => {
          const chosen = (item.originalPrice || item.bundle?.length) && promotionPhotoId ? promotionPhotoId : photoId;
          return chosen ? {...item,imageUrl:'/fotos/' + chosen + '.jpg'} : withMenuPhoto(item);
        }) : [];
        return json({phone:settings.phone, fee:settings.fee, day:settings.day, waitMinutes:settings.waitMinutes ?? null,
          pixKey:settings.pixKey ?? '', items:orderMenuItems(items), demo: !settings.day, revision, today: today()});
      }
      if (path !== '/api/admin') return json({error:'Método inválido.'},405);
      if (!adminSession && row && row.owner !== identity) return json({error:'O painel pertence à conta responsável.'},403);
      if (request.method === 'GET') return json({ ...settings, items:settings.items.map(withMenuPhoto), revision, today: today() });
      if (request.method !== 'PUT' || !request.headers.get('content-type')?.startsWith('application/json') ||
          (adminSession && request.headers.get('origin') !== url.origin) ||
          (request.headers.has('origin') && request.headers.get('origin') !== url.origin)) return json({error:'Solicitação inválida.'},400);
      const raw = await readAdminBody(request);
      if (raw === null) return json({error:'Dados acima do limite.'},413);
      let next;
      try {
        const data = JSON.parse(raw);
        if (data.revision !== revision) return json({error:'O painel mudou. Reabra para carregar os dados mais recentes.'},409);
        next = await clean(data, settings);
      } catch (error) { return json({error:error.message},400); }
      const result = await env.DB.prepare(`INSERT INTO restaurant (id,owner,settings,revision) VALUES (1,?,?,1)
        ON CONFLICT(id) DO UPDATE SET settings=excluded.settings, revision=restaurant.revision+1
        WHERE restaurant.owner=excluded.owner AND restaurant.revision=?`).bind(row?.owner ?? identity ?? 'restaurant-admin',JSON.stringify(next),revision).run();
      if (result.meta.changes !== 1) return json({error:'O painel mudou. Reabra para continuar.'},409);
      return json({...next,revision:revision+1,today:today()});
    } catch {
      return json({error:'O cardápio está temporariamente indisponível. Tente novamente.'},503);
    }
  },
};
