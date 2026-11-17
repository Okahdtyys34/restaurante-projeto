const categories = ['Pratos', 'Bebidas', 'Sobremesas'];
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
const encode = new TextEncoder();
const loginPage = '/gestao/login';
const sessionName = '__Host-familia-gestao';
const sessionSeconds = 8 * 60 * 60;

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

function clean(data, current) {
  const phone = typeof data.phone === 'string' ? data.phone.replace(/\D/g,'') : '';
  if (phone && !/^55[1-9]\d[2-9]\d{7,8}$/.test(phone)) throw new Error('Informe o WhatsApp com +55, DDD e número.');
  if (!Number.isInteger(data.fee) || data.fee < 0 || data.fee > 99999) throw new Error('Confira a taxa de entrega.');
  if (!['publish','contact'].includes(data.action)) throw new Error('Ação inválida.');
  if (data.action === 'contact') return { ...current, phone, fee: data.fee };
  if (!Array.isArray(data.items) || data.items.length < 1 || data.items.length > 20) throw new Error('Inclua de 1 a 20 itens.');
  const names = new Set();
  const items = data.items.map((item, index) => {
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    const description = typeof item?.description === 'string' ? item.description.trim() : '';
    const key = name.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/\p{Diacritic}/gu,'');
    if (!name || name.length > 70 || description.length > 160 || names.has(key) ||
        !categories.includes(item.category) || !Number.isInteger(item.price) || item.price < 1 || item.price > 999999) {
      throw new Error(`Confira o nome, a categoria e o preço do item ${index + 1}.`);
    }
    names.add(key);
    return { name, description, category: item.category, price: item.price };
  });
  return { phone, fee: data.fee, items, day: today() };
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
    if (request.method === 'GET' && path === '/hero.jpg' && HERO) {
      return new Response(Uint8Array.from(atob(HERO), char => char.charCodeAt(0)), {headers:{'Content-Type':'image/jpeg','Cache-Control':'public, max-age=86400'}});
    }
    if (request.method === 'GET' && Object.hasOwn(ASSETS,path)) {
      const type = path.endsWith('.css') ? 'text/css' : path.endsWith('.js') ? 'text/javascript' : 'text/html';
      const privatePage = isManagementAsset || path === loginPage;
      const asset = path === loginPage ? ASSETS[path].replace('<!--LOGIN_ERROR-->',
        url.searchParams.get('erro') === '1' ? '<p class="feedback" role="alert">Usuário ou senha incorretos.</p>' : '') : ASSETS[path];
      return new Response(asset,{headers:{'Content-Type':`${type}; charset=utf-8`,'Cache-Control':privatePage?'no-store':'no-cache',
        ...(privatePage?{'X-Robots-Tag':'noindex, nofollow'}:{}),
        'Content-Security-Policy':"default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; form-action 'self'; base-uri 'none'" + (privatePage ? "; frame-ancestors 'none'" : ''),'Referrer-Policy':privatePage ? 'same-origin' : 'no-referrer'}});
    }
    if (!['/api/menu','/api/admin'].includes(path)) return json({error:'Página não encontrada.'},404);
    try {
      const row = await env.DB.prepare('SELECT owner, settings, revision FROM restaurant WHERE id = 1').first();
      const settings = row ? JSON.parse(row.settings) : demo;
      const revision = row?.revision ?? 0;
      if (path === '/api/menu' && request.method === 'GET') {
        const active = !settings.day || settings.day === today();
        return json({ ...settings, items: active ? settings.items : [], demo: !settings.day, revision, today: today() });
      }
      if (path !== '/api/admin') return json({error:'Método inválido.'},405);
      if (!adminSession && row && row.owner !== identity) return json({error:'O painel pertence à conta responsável.'},403);
      if (request.method === 'GET') return json({ ...settings, revision, today: today() });
      if (request.method !== 'PUT' || !request.headers.get('content-type')?.startsWith('application/json') ||
          (adminSession && request.headers.get('origin') !== url.origin) ||
          (request.headers.has('origin') && request.headers.get('origin') !== url.origin)) return json({error:'Solicitação inválida.'},400);
      const raw = await request.text();
      if (raw.length > 15000) return json({error:'Dados acima do limite.'},413);
      let next;
      try {
        const data = JSON.parse(raw);
        if (data.revision !== revision) return json({error:'O painel mudou. Reabra para carregar os dados mais recentes.'},409);
        next = clean(data, settings);
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
