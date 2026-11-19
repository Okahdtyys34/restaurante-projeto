const $ = id => document.getElementById(id);
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const brl = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const money = cents => brl.format(cents / 100);
const cents = value => /^\d{1,5}([,.]\d{1,2})?$/.test(value.trim()) ? Math.round(Number(value.replace(',','.')) * 100) : NaN;
const itemKey = value => value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/\p{Diacritic}/gu,'');
const categories = ['Pratos','Bebidas','Sobremesas'];
const menuFilters = [...categories,'Promoções'];
const isPromotion = item => Boolean(item.originalPrice > item.price || item.bundle?.length);
const matchesFilter = item => state.filter === 'Promoções' ? isPromotion(item) : item.category === state.filter;
const state = {menu:{items:[],fee:0,phone:''},filter:null,cart:new Map()};
const productNotes = new Map();
function moveProductNote(from, to) {
  if (from === to || !productNotes.has(from)) return;
  const notes = [...new Set([productNotes.get(to),productNotes.get(from)].filter(Boolean))];
  productNotes.set(to, notes.join(' / '));
  productNotes.delete(from);
}
const menuEndpoint = new URLSearchParams(location.search).get('apresentacao') === '1'
  ? '/api/menu?apresentacao=1' : '/api/menu';
const lineKey = (index, addons = []) => JSON.stringify([index, ...addons.map(addon=>itemKey(addon.name)).sort()]);
const unitPrice = (item, addons) => item.price + addons.reduce((sum,addon)=>sum+addon.price,0);
const addonNames = addons => addons.map(addon=>addon.name).join(', ');
const addonsFor = (item, keys) => (item.addons ?? []).filter(addon=>keys.includes(itemKey(addon.name)));
function entries() {
  return [...state.cart].map(([key,qty]) => {
    const [index, ...selected] = JSON.parse(key);
    const item = state.menu.items[index];
    const addons = addonsFor(item, selected);
    return {...item, key, index, qty, addons, note:productNotes.get(key) ?? '', unitPrice:unitPrice(item, addons), hasAddons:Boolean(item.addons?.length)};
  });
}
const itemQuantity = index => entries().reduce((sum,item)=>sum + (item.index === index ? item.qty : 0),0);
const subtotal = () => entries().reduce((sum,item)=>sum + item.qty*item.unitPrice,0);
const labelCount = count => `${count} ${count === 1 ? 'item' : 'itens'}`;

async function api(path, options) {
  const response = await fetch(path,options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível carregar.');
  return data;
}

function renderMenu() {
  const { items, today, demo } = state.menu;
  const wait = $('wait-estimate');
  wait.hidden = !state.menu.waitMinutes || !items.length || demo;
  wait.textContent = wait.hidden ? '' : 'Espera média de ' + state.menu.waitMinutes + ' min';
  state.filter ??= categories.find(category=>items.some(item=>item.category===category)) ?? null;
  $('menu-date').textContent = today ? new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',day:'numeric',month:'long'}).format(new Date(`${today}T12:00:00Z`)) : '';
  $('menu-note').hidden = !demo;
  $('menu-note').textContent = state.menu.presentation
    ? 'Cardápio de apresentação com imagens ilustrativas geradas por IA.'
    : demo ? 'Cardápio de exemplo. Monte um pedido para testar o fluxo.' : '';
  $('filters').hidden = !items.length;
  $('filters').innerHTML = menuFilters.map(group=>`<button type="button" class="filter" data-filter="${group}" aria-pressed="${group===state.filter}" aria-controls="menu-items">${group}</button>`).join('');
  $('menu-items').innerHTML = items.map((item,index)=>{
    if (!matchesFilter(item)) return '';
    const action = 'Adicionar';
    const label = `${action} ${item.name}`;
    return `<li class="menu-item">${item.imageUrl ? `<img class="product-photo" src="${esc(item.imageUrl)}" width="600" height="400" alt="" loading="lazy" decoding="async">` : ''}
    <div class="item-meta"><span class="index"><span class="sr-only">Opção </span>${index+1}</span></div>
    <div class="item-copy"><span class="item-category">${esc(item.category)}${item.originalPrice ? ' · Promoção' : ''}${item.bundle?.length ? ' · Combo' : ''}</span><h3>${esc(item.name)}</h3>${item.description ? `<p>${esc(item.description)}</p>` : ''}${item.bundle?.length ? `<p>Inclui: ${esc(item.bundle.join(' + '))}</p>` : ''}</div>
    <div class="item-right"><span>${item.originalPrice ? `<del class="old-price"><span class="sr-only">Preço antigo: </span>${money(item.originalPrice)}</del> ` : ''}<strong>${money(item.price)}</strong></span><button type="button" class="add" data-add="${index}" aria-label="${esc(label)}"><span aria-hidden="true">+</span> ${action}</button></div></li>`;
  }).join('');
  $('empty-menu').hidden = items.some(matchesFilter);
  $('empty-menu').textContent = !items.length ? 'O cardápio de hoje ainda não foi publicado.' : state.filter === 'Promoções' ? 'Nenhuma promoção disponível hoje.' : 'Nenhum item nesta categoria hoje.';
}

function renderCart() {
  const items = entries();
  const count = items.reduce((sum,item)=>sum+item.qty,0);
  const amount = money(subtotal());
  $('nav-count').textContent = count;
  $('cart-count').textContent = labelCount(count);
  $('cart-empty').hidden = Boolean(count);
  $('checkout-open').disabled = !count;
  $('subtotal').textContent = amount;
  $('mobile-cart').hidden = !count;
  $('mobile-cart-count').textContent = labelCount(count);
  $('mobile-cart-total').textContent = amount;
  document.body.classList.toggle('has-mobile-cart',Boolean(count));
  $('cart-items').innerHTML = items.map((item, position)=>{
    const label = esc(item.name + (item.addons.length ? `, com ${addonNames(item.addons)}` : item.hasAddons ? ', sem adicionais' : ''));
    const key = esc(item.key);
    return `<li class="cart-item"><div class="cart-product">
      ${item.imageUrl ? `<img class="cart-photo" src="${esc(item.imageUrl)}" alt="" width="64" height="64" loading="lazy">` : ''}
      <div><b>${esc(item.name)}</b>
      ${item.bundle?.length ? `<small>Inclui: ${esc(item.bundle.join(' + '))}</small>` : ''}
      ${item.addons.length ? `<small>Adicionais: ${esc(addonNames(item.addons))}</small>` : ''}
      <small>${money(item.unitPrice*item.qty)}</small>
      ${item.hasAddons ? `<button type="button" class="link-button cart-addons" data-edit-addons="${key}" aria-label="Editar adicionais de ${label}">Editar adicionais</button>` : ''}</div></div>
      <div class="quantity"><button type="button" data-delta="-1" data-line="${key}" aria-label="Diminuir ${label}">−</button><span>${item.qty}</span><button type="button" data-delta="1" data-line="${key}" aria-label="Aumentar ${label}" ${itemQuantity(item.index)>=20?'disabled':''}>+</button></div>
      <div class="product-note"><label for="product-note-${position}">Observações para ${esc(item.name)} (opcional)</label><textarea id="product-note-${position}" data-product-note="${key}" rows="2" maxlength="200" placeholder="Ex.: sem cebola">${esc(item.note)}</textarea></div></li>`;
  }).join('');
}

function menuFeedback(message, success = false) {
  const feedback = $('feedback');
  feedback.toggleAttribute('data-success',success);
  feedback.textContent = message;
}

function updateCart(key, delta) {
  const [index] = JSON.parse(key);
  const item = state.menu.items[index];
  if (!item) return false;
  const total = itemQuantity(index) + delta;
  if (total>20) { menuFeedback('O limite é de 20 unidades por item.'); return false; }
  const qty = (state.cart.get(key) ?? 0) + delta;
  if (qty>0) state.cart.set(key,qty);
  else { state.cart.delete(key); productNotes.delete(key); }
  menuFeedback(delta>0 ? `${item.name} no carrinho (${total}).` : '',delta>0);
  renderCart();
  return true;
}

const productOptions = $('product-options');
productOptions.addEventListener('keydown',()=>productOptions.removeAttribute('data-motion'));
productOptions.addEventListener('cancel',()=>productOptions.removeAttribute('data-motion'));
productOptions.addEventListener('click',event=>{
  if (event.target.closest('button')) productOptions.toggleAttribute('data-motion',event.detail>0);
});
let selectedProduct;
function selectedAddons(item) {
  const form = $('product-options-form');
  return addonsFor(item, new FormData(form).getAll('addon'));
}
function updateOptionsTotal() {
  const {item, qty} = selectedProduct;
  $('product-options-total').textContent = money(unitPrice(item, selectedAddons(item))*qty);
}
function chooseAddons(index, existing, animate = false) {
  const item = state.menu.items[index];
  const qty = existing ? state.cart.get(existing) : 1;
  selectedProduct = {item,index,qty,existing};
  const selected = existing ? JSON.parse(existing).slice(1) : [];
  $('product-options-title').textContent = qty > 1 ? `${qty} × ${item.name}` : item.name;
  $('product-addon-list').innerHTML = item.addons.map(addon=>{
    const key = itemKey(addon.name);
    return `<label class="addon-option"><input type="checkbox" name="addon" value="${esc(key)}" ${selected.includes(key)?'checked':''}>
      <span>${esc(addon.name)}</span><strong>${addon.price ? '+ ' + money(addon.price) : 'Grátis'}</strong></label>`;
  }).join('');
  $('product-options-submit').textContent = existing ? 'Salvar adicionais' : 'Adicionar ao pedido';
  updateOptionsTotal();
  productOptions.scrollTop = 0;
  productOptions.toggleAttribute('data-motion',animate);
  productOptions.showModal();
}
function addFromMenu(index, animate = false) {
  if (itemQuantity(index) >= 20) {
    menuFeedback('O limite é de 20 unidades por item.');
    return false;
  }
  if (state.menu.items[index].addons?.length) {
    chooseAddons(index, undefined, animate);
    return true;
  }
  return updateCart(lineKey(index),1);
}
$('product-options-form').addEventListener('change',updateOptionsTotal);
$('product-options-close').addEventListener('click',()=>productOptions.close());
$('product-options-form').addEventListener('submit',event=>{
  event.preventDefault();
  const {item,index,qty,existing} = selectedProduct;
  const key = lineKey(index, selectedAddons(item));
  if (existing && existing !== key) {
    state.cart.delete(existing);
    state.cart.set(key,(state.cart.get(key) ?? 0) + qty);
    moveProductNote(existing,key);
    renderCart();
  } else if (!existing) {
    updateCart(key,1);
  }
  productOptions.close();
  if (existing) {
    [...$('cart-items').querySelectorAll('[data-edit-addons]')].find(button=>button.dataset.editAddons===key)?.focus();
  }
});

$('filters').addEventListener('click',event=>{
  const button = event.target.closest('[data-filter]');
  if (!button) return;
  state.filter = button.dataset.filter;
  renderMenu();
  [...$('filters').children].find(child=>child.dataset.filter===state.filter)?.focus();
});
$('menu-items').addEventListener('click',event=>{
  const button = event.target.closest('[data-add]');
  if (button) addFromMenu(Number(button.dataset.add), event.detail>0);
});
$('cart-items').addEventListener('click',event=>{
  const edit = event.target.closest('[data-edit-addons]');
  if (edit) {
    const key = edit.dataset.editAddons;
    chooseAddons(JSON.parse(key)[0],key,event.detail>0);
    return;
  }
  const button = event.target.closest('[data-delta]');
  if (!button) return;
  const {line, delta} = button.dataset;
  updateCart(line, Number(delta));
  const controls = [...$('cart-items').querySelectorAll('[data-delta]:enabled')];
  const next = controls.find(control=>control.dataset.line===line && control.dataset.delta===delta)
    || controls.find(control=>control.dataset.line===line)
    || controls[0]
    || document.querySelector(`.nav-cart`);
  next.focus();
});
$('cart-items').addEventListener('input',event=>{
  if (event.target.matches('[data-product-note]')) productNotes.set(event.target.dataset.productNote,event.target.value);
});
function checkoutDetails() {
  const delivery = $('checkout-form').elements.mode.value === 'delivery';
  $('address-box').hidden = !delivery;
  for (const id of ['street','address-number','neighborhood']) $(id).required = delivery;
  $('change-box').hidden = $('payment').value !== 'cash';
  $('fee-label').textContent = state.menu.fee ? `(+ ${money(state.menu.fee)})` : '(grátis)';
  $('checkout-total').textContent = money(subtotal()+(delivery?state.menu.fee:0));
}
function renderCheckoutNotes() {
  $('checkout-product-notes').innerHTML = entries().map((item,position)=>`
    <div class="checkout-product-heading">
      ${item.imageUrl ? `<img class="cart-photo" src="${esc(item.imageUrl)}" alt="" width="64" height="64">` : ''}
      <strong>${item.qty} × ${esc(item.name)}</strong>
    </div>
    <label for="checkout-note-${position}">Observação — ${item.qty} × ${esc(item.name)} (opcional)</label>
    ${item.addons.length ? `<p class="cart-note">Adicionais: ${esc(addonNames(item.addons))}</p>` : ''}
    <textarea id="checkout-note-${position}" data-product-note="${esc(item.key)}" rows="2" maxlength="200" placeholder="Ex.: sem cebola">${esc(item.note)}</textarea>`).join('');
}
$('checkout-product-notes').addEventListener('input',event=>{
  if (!event.target.matches('[data-product-note]')) return;
  productNotes.set(event.target.dataset.productNote,event.target.value);
  const cartInput = [...$('cart-items').querySelectorAll('[data-product-note]')].find(input=>input.dataset.productNote===event.target.dataset.productNote);
  if (cartInput) cartInput.value = event.target.value;
});

const checkout = $('checkout');
let checkoutSession = 0;
let orderReference;
let orderDate;
checkout.addEventListener('click', event => {
  if (event.target.closest('button')) checkout.toggleAttribute('data-step-motion', event.detail > 0);
});
checkout.addEventListener('keydown', () => checkout.removeAttribute('data-step-motion'));
function checkoutStep(review) {
  $('checkout-step').textContent = review ? '2 DE 2 · REVISÃO' : '1 DE 2 · DADOS DO PEDIDO';
  $('checkout-title').textContent = review ? 'Confira seu pedido' : 'Finalizar pedido';
  $('checkout-form').hidden = review;
  $('summary-box').hidden = !review;
}
function openCheckout(event) {
  checkoutSession++;
  orderReference = 'BR-' + crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
  orderDate = new Date();
  checkoutStep(false);
  $('checkout-error').textContent = '';
  checkoutDetails();
  renderCheckoutNotes();
  checkout.toggleAttribute('data-motion',event.detail>0);
  checkout.showModal();
}
$('checkout-open').addEventListener('click',openCheckout);
$('mobile-checkout').addEventListener('click',openCheckout);
checkout.addEventListener('cancel',()=>checkout.removeAttribute('data-motion'));
$('checkout-form').addEventListener('change',checkoutDetails);
function refreshCart(live, delivery) {
  const previous = state.menu;
  if (live.revision === previous.revision && live.today === previous.today) return [];
  const selected = entries();
  const updated = new Map(live.items.map((item, index) => [itemKey(item.name), {item, index}]));
  const unavailable = [];
  const changed = new Set();
  const oldNotes = new Map(productNotes);
  state.menu = live;
  state.cart.clear();
  productNotes.clear();
  for (const item of selected) {
    const match = updated.get(itemKey(item.name));
    if (!match) { unavailable.push(item.name); continue; }
    const options = addonsFor(match.item, item.addons.map(addon=>itemKey(addon.name)));
    const oldOptions = new Map(item.addons.map(addon=>[itemKey(addon.name), addon]));
    const optionsChanged = options.length !== item.addons.length || options.some(addon=>{
      const previousAddon = oldOptions.get(itemKey(addon.name));
      return addon.price !== previousAddon.price || addon.name !== previousAddon.name;
    });
    const key = lineKey(match.index, options);
    state.cart.set(key,(state.cart.get(key) ?? 0) + item.qty);
    if (oldNotes.get(item.key)) {
      const notes = [...new Set([productNotes.get(key),oldNotes.get(item.key)].filter(Boolean))];
      productNotes.set(key,notes.join(' / '));
    }
    if (item.price !== match.item.price || item.description !== match.item.description || JSON.stringify(item.bundle ?? []) !== JSON.stringify(match.item.bundle ?? []) || optionsChanged) changed.add(item.name);
  }
  renderMenu();
  renderCart();
  checkoutDetails();
  renderCheckoutNotes();
  const notices = [];
  if (unavailable.length) notices.push(`Itens indisponíveis removidos: ${[...new Set(unavailable)].join(', ')}.`);
  if (changed.size) notices.push(`Confira os itens e adicionais atualizados: ${[...changed].join(', ')}.`);
  if (delivery && live.fee !== previous.fee) notices.push(`A taxa de entrega mudou para ${money(live.fee)}.`);
  return notices;
}

function receiptLine(label, value) {
  return `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
}

function renderReceipt(data) {
  const live = state.menu;
  const delivery = data.get('mode') === 'delivery';
  const name = data.get('name').trim();
  const street = data.get('street').trim();
  const addressNumber = data.get('number').trim();
  const neighborhood = data.get('neighborhood').trim();
  const address = `${street}, ${addressNumber} — ${neighborhood}`;
  let phone = data.get('phone').replace(/\D/g, '');
  if (phone.length === 10 || phone.length === 11) phone = '55' + phone;
  if (!/^55[1-9]\d[2-9]\d{7,8}$/.test(phone)) throw new Error('Informe seu telefone com DDD.');
  if (name.length<2 || (delivery && (!street || !addressNumber || !neighborhood))) throw new Error('Confira o nome e, para entrega, a rua, o número e o bairro.');
  const items = entries();
  const amount = subtotal();
  const total = amount + (delivery ? live.fee : 0);
  const pixKey = data.get('payment') === 'pix' && !live.demo ? live.pixKey : '';
  const payment = {pix:pixKey ? 'Pix' : 'Pix a combinar',card:'Cartão no recebimento',cash:'Dinheiro'}[data.get('payment')];
  $('pix-info').hidden = !pixKey;
  $('customer-pix-key').value = pixKey || '';
  $('pix-copy-feedback').textContent = '';
  const changeInput = data.get('change').trim();
  const change = payment==='Dinheiro' && changeInput ? cents(changeInput) : null;
  if (change!==null && (!Number.isFinite(change) || change<total)) throw new Error('O valor para troco deve ser igual ou maior que o total.');
  const details = [['Recebimento', delivery ? 'Entrega' : 'Retirada no restaurante'], ['Nome', name], ['Telefone', phone]];
  if (delivery) details.push(['Endereço', address]);
  if (live.waitMinutes && !live.demo) details.push(['Espera média', live.waitMinutes + ' min']);
  details.push(['Pagamento', payment]);
  if (change !== null) details.push(['Troco para', money(change)]);
  const costs = [['Subtotal', money(amount)]];
  if (delivery) costs.push(['Taxa de entrega', money(live.fee)]);
  $('receipt').innerHTML = `<ul aria-label="Itens do pedido">${items.map(item =>
    `<li><div class="receipt-product">${item.imageUrl ? `<img class="cart-photo" src="${esc(item.imageUrl)}" alt="" width="64" height="64">` : ''}<span>${item.qty} × ${esc(item.name)}${item.addons.length ? `<small class="receipt-addons">Adicionais: ${esc(addonNames(item.addons))}</small>` : ''}${item.note ? `<small class="receipt-addons">Observações: ${esc(item.note)}</small>` : ''}</span></div><strong>${money(item.qty * item.unitPrice)}</strong></li>`).join('')}</ul>
    <dl class="receipt-costs">${costs.map(pair => receiptLine(...pair)).join('')}${receiptLine('Total', money(total))}</dl>
    <dl class="receipt-details">${details.map(pair => receiptLine(...pair)).join('')}</dl>`;
  $('summary').value = [
    'Pedido realizado pelo site: ' + location.origin,
    '', 'Pedido: ' + orderReference,
    'Data: ' + new Intl.DateTimeFormat('pt-BR', {timeZone:'America/Fortaleza',dateStyle:'short',timeStyle:'short'}).format(orderDate),
    '', '*CLIENTE: ' + name + '*',
    `*${delivery ? 'ENTREGA' : 'RETIRADA'}*`,
    'Telefone: ' + phone,
    ...(delivery ? ['Rua: ' + street, 'Número: ' + addressNumber, 'Bairro: ' + neighborhood] : []),
    ...(live.waitMinutes && !live.demo ? ['Espera média: ' + live.waitMinutes + ' min'] : []),
    '', '*Produtos*',
    ...items.flatMap(item => [
      `*• ${item.qty} × ${item.name}* — ${money(item.qty * item.unitPrice)}`,
      ...(item.bundle?.length ? ['  Inclui: ' + item.bundle.join(' + ')] : []),
      ...(item.addons.length ? [`  Adicionais por unidade: ${addonNames(item.addons)}`] : []),
      ...(item.note ? ['  *Obs.: ' + item.note + '*'] : []),
    ]), '',
    'Subtotal: ' + money(amount),
    ...(delivery ? ['Entrega: ' + money(live.fee)] : []),
    `*Total: ${money(total)}*`,
    '', '*Pagamento*',
    'Forma: ' + payment,
    'Pagamento: a confirmar',
    ...(pixKey ? ['Chave Pix: ' + pixKey] : []),
    ...(change !== null ? ['Troco para: ' + money(change)] : []),
  ].join('\n');
  $('summary').hidden = true;
  $('copy-feedback').textContent = '';
  const ready = Boolean(live.phone && !live.demo);
  $('whatsapp').hidden = !ready;
  $('handoff-note').textContent = ready ? 'No WhatsApp, toque em Enviar para fazer o pedido.' :
    live.demo ? 'Pedido de exemplo. Copie o resumo para testar.' : 'WhatsApp indisponível. Copie o resumo do pedido.';
}

async function reviewOrder(button, sending = false) {
  const session = checkoutSession;
  const error = $('checkout-error');
  const notice = $('receipt-notice');
  const previousPhone = state.menu.phone;
  const previousPix = state.menu.pixKey;
  error.textContent = '';
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try {
    const live = await api(menuEndpoint);
    if (!checkout.open || session !== checkoutSession) return;
    const data = new FormData($('checkout-form'));
    const changes = refreshCart(live, data.get('mode') === 'delivery');
    if (!state.cart.size) {
      checkout.removeAttribute('data-motion');
      checkout.close();
      menuFeedback(changes.join(' ') || 'Escolha um item do cardápio para continuar.');
      document.querySelector('.nav-cart').focus();
      return;
    }
    if (sending && live.phone !== previousPhone) changes.push('O contato de WhatsApp do restaurante mudou.');
    if (sending && data.get('payment') === 'pix' && live.pixKey !== previousPix) changes.push('O restaurante atualizou as informações do Pix. Confira antes de continuar.');
    try { renderReceipt(data); }
    catch (validationError) {
      checkoutStep(false);
      error.textContent = [...changes, validationError.message].join(' ');
      return;
    }
    if (sending && !changes.length && live.phone && !live.demo) {
      window.location.assign(`https://wa.me/${live.phone}?text=${encodeURIComponent($('summary').value)}`);
      return;
    }
    notice.textContent = changes.join(' ');
    checkoutStep(true);
    checkout.scrollTop = 0;
    $('checkout-title').focus();
  } catch {
    if (session === checkoutSession) {
      (sending ? notice : error).textContent = 'Não foi possível conferir o cardápio. Tente novamente.';
    }
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
}
$('checkout-form').addEventListener('submit', event => {
  event.preventDefault();
  reviewOrder(event.submitter || event.currentTarget.querySelector('[type=submit]'));
});
$('whatsapp').addEventListener('click', event => reviewOrder(event.currentTarget, true));
$('summary-edit').addEventListener('click',()=>{ checkoutSession++; checkoutStep(false); $('name').focus(); });
$('copy-pix').addEventListener('click', async () => {
  const field = $('customer-pix-key');
  try {
    await navigator.clipboard.writeText(field.value);
    $('pix-copy-feedback').textContent = 'Chave Pix copiada.';
  } catch {
    field.focus();
    field.select();
    $('pix-copy-feedback').textContent = 'Selecione e copie a chave Pix.';
  }
});
$('summary-copy').addEventListener('click',async()=>{
  try { await navigator.clipboard.writeText($('summary').value); $('copy-feedback').textContent='Resumo copiado.'; }
  catch { $('summary').hidden = false; $('summary').focus(); $('summary').select(); $('copy-feedback').textContent='Selecione e copie o texto do resumo.'; }
});

checkout.querySelector('[data-close]').addEventListener('click',event=>{
  if (event.detail===0) checkout.removeAttribute('data-motion');
  checkout.close();
});

try { state.menu=await api(menuEndpoint); renderMenu(); renderCart(); }
catch { $('empty-menu').textContent='Não foi possível carregar o cardápio. Atualize a página para tentar novamente.'; }
