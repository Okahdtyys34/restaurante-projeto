const $ = id => document.getElementById(id);
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const brl = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const money = cents => brl.format(cents / 100);
const cents = value => /^\d{1,5}([,.]\d{1,2})?$/.test(value.trim()) ? Math.round(Number(value.replace(',','.')) * 100) : NaN;
const normalize = value => value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const itemKey = value => value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/\p{Diacritic}/gu,'');
const categories = ['Pratos','Bebidas','Sobremesas'];
const state = {menu:{items:[],fee:0,phone:''},filter:'Todos',cart:new Map()};
const entries = () => [...state.cart].map(([index,qty]) => ({...state.menu.items[index],index,qty}));
const subtotal = () => entries().reduce((sum,item)=>sum + item.qty*item.price,0);
const labelCount = count => `${count} ${count === 1 ? 'item' : 'itens'}`;

async function api(path, options) {
  const response = await fetch(path,options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível carregar.');
  return data;
}

function renderMenu() {
  const { items, today, demo } = state.menu;
  const groups = ['Todos', ...categories.filter(category=>items.some(item=>item.category===category))];
  if (!groups.includes(state.filter)) state.filter = 'Todos';
  $('menu-date').textContent = today ? new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',day:'numeric',month:'long'}).format(new Date(`${today}T12:00:00Z`)) : '';
  $('menu-note').textContent = demo ? 'Cardápio de exemplo. Monte um pedido para testar o fluxo.' : 'Escolha um prato ou adicione pelo número ou nome.';
  $('filters').hidden = $('quick-form').hidden = !items.length;
  $('filters').innerHTML = groups.map(group=>`<button type="button" class="filter" data-filter="${group}" aria-pressed="${group===state.filter}">${group}</button>`).join('');
  $('menu-items').innerHTML = items.map((item,index)=>state.filter!=='Todos' && item.category!==state.filter ? '' : `<li class="menu-item">
    <div class="item-meta"><span class="index" aria-label="Opção ${index+1}">${String(index+1).padStart(2,'0')}</span></div>
    <div class="item-copy"><span class="item-category">${esc(item.category)}</span><h3>${esc(item.name)}</h3>${item.description ? `<p>${esc(item.description)}</p>` : ''}</div>
    <div class="item-right"><strong>${money(item.price)}</strong><button type="button" class="add" data-add="${index}" aria-label="Adicionar ${esc(item.name)}"><span aria-hidden="true">+</span> Adicionar</button></div></li>`).join('');
  $('empty-menu').hidden = Boolean(items.length);
  if (!items.length) $('empty-menu').textContent = 'O cardápio de hoje ainda não foi publicado.';
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
  $('cart-items').innerHTML = items.map(item=>`<li class="cart-item"><div><b>${esc(item.name)}</b><small>${money(item.price*item.qty)}</small></div>
    <div class="quantity"><button type="button" data-delta="-1" data-index="${item.index}" aria-label="Diminuir ${esc(item.name)}">−</button><span>${item.qty}</span><button type="button" data-delta="1" data-index="${item.index}" aria-label="Aumentar ${esc(item.name)}" ${item.qty>=20?'disabled':''}>+</button></div></li>`).join('');
}

function menuFeedback(message, success = false) {
  const feedback = $('feedback');
  feedback.toggleAttribute('data-success',success);
  feedback.textContent = message;
}

function updateCart(index, delta) {
  const item = state.menu.items[index];
  if (!item) return false;
  const qty = (state.cart.get(index) ?? 0) + delta;
  if (qty>20) { menuFeedback('O limite é de 20 unidades por item.'); return false; }
  if (qty>0) state.cart.set(index,qty); else state.cart.delete(index);
  menuFeedback(delta>0 ? `${item.name} no carrinho (${qty}).` : '',delta>0);
  renderCart();
  return true;
}

$('filters').addEventListener('click',event=>{
  const button = event.target.closest('[data-filter]');
  if (!button) return;
  state.filter = button.dataset.filter;
  renderMenu();
  [...$('filters').children].find(child=>child.dataset.filter===state.filter)?.focus();
});
$('menu-items').addEventListener('click',event=>{
  const button = event.target.closest('[data-add]');
  if (button) updateCart(Number(button.dataset.add),1);
});
$('cart-items').addEventListener('click',event=>{
  const button = event.target.closest('[data-delta]');
  if (!button) return;
  const {index, delta} = button.dataset;
  updateCart(Number(index), Number(delta));
  const controls = $('cart-items');
  const next = controls.querySelector(`[data-index="${index}"][data-delta="${delta}"]:enabled`)
    || controls.querySelector(`[data-index="${index}"]:enabled`)
    || controls.querySelector('button:enabled')
    || document.querySelector(`.nav-cart`);
  next.focus();
});
$('quick-form').addEventListener('submit',event=>{
  event.preventDefault();
  const query = normalize($('quick-item').value).replace(/^opcao /,'').replace(/^(?:eu )?quero (?:um |uma )?/,'').replace(/ por favor$/,'');
  if (!query) return;
  const candidates = state.menu.items.map((item,index)=>({name:normalize(item.name),index}));
  const exact = candidates.filter(item=>item.name===query);
  const partial = candidates.filter(item=>item.name.startsWith(`${query} `));
  const matches = /^\d+$/.test(query) ? candidates.filter(item=>item.index===Number(query)-1) : exact.length ? exact : partial;
  if (matches.length>1) { menuFeedback(`Qual deles? Digite um destes números: ${matches.map(item=>`${item.index+1} (${state.menu.items[item.index].name})`).join(', ')}.`); return; }
  if (!matches.length) { menuFeedback('Item não encontrado. Confira o nome ou o número na lista.'); return; }
  if (updateCart(matches[0].index,1)) $('quick-item').value = '';
});

function checkoutDetails() {
  const delivery = $('checkout-form').elements.mode.value === 'delivery';
  $('address-box').hidden = !delivery;
  $('address').required = delivery;
  $('change-box').hidden = $('payment').value !== 'cash';
  $('fee-label').textContent = state.menu.fee ? `(+ ${money(state.menu.fee)})` : '(grátis)';
  $('checkout-total').textContent = money(subtotal()+(delivery?state.menu.fee:0));
}

const checkout = $('checkout');
let checkoutSession = 0;
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
  checkoutStep(false);
  $('checkout-error').textContent = '';
  checkoutDetails();
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
  const changed = [];
  state.menu = live;
  state.cart.clear();
  for (const item of selected) {
    const match = updated.get(itemKey(item.name));
    if (!match) { unavailable.push(item.name); continue; }
    state.cart.set(match.index, item.qty);
    if (item.price !== match.item.price || item.description !== match.item.description) changed.push(item.name);
  }
  renderMenu();
  renderCart();
  checkoutDetails();
  const notices = [];
  if (unavailable.length) notices.push(`Itens indisponíveis removidos: ${unavailable.join(', ')}.`);
  if (changed.length) notices.push(`Confira os itens atualizados: ${changed.join(', ')}.`);
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
  const address = data.get('address').trim();
  const note = data.get('note').trim();
  if (name.length<2 || (delivery && address.length<8)) throw new Error('Confira o nome e, para entrega, o endereço completo.');
  const items = entries();
  const amount = subtotal();
  const total = amount + (delivery ? live.fee : 0);
  const payment = {pix:'Pix a combinar',card:'Cartão no recebimento',cash:'Dinheiro'}[data.get('payment')];
  const changeInput = data.get('change').trim();
  const change = payment==='Dinheiro' && changeInput ? cents(changeInput) : null;
  if (change!==null && (!Number.isFinite(change) || change<total)) throw new Error('O valor para troco deve ser igual ou maior que o total.');
  const details = [['Recebimento', delivery ? 'Entrega' : 'Retirada no restaurante'], ['Nome', name]];
  if (delivery) details.push(['Endereço', address]);
  details.push(['Pagamento', payment]);
  if (change !== null) details.push(['Troco para', money(change)]);
  if (note) details.push(['Observações', note]);
  const costs = [['Subtotal', money(amount)]];
  if (delivery) costs.push(['Taxa de entrega', money(live.fee)]);
  $('receipt').innerHTML = `<ul aria-label="Itens do pedido">${items.map(item =>
    `<li><span>${item.qty} × ${esc(item.name)}</span><strong>${money(item.qty * item.price)}</strong></li>`).join('')}</ul>
    <dl class="receipt-costs">${costs.map(pair => receiptLine(...pair)).join('')}${receiptLine('Total', money(total))}</dl>
    <dl class="receipt-details">${details.map(pair => receiptLine(...pair)).join('')}</dl>`;
  $('summary').value = [
    '*Pedido | Restaurante da Família*', '', ...items.map(item => `${item.qty} × ${item.name} — ${money(item.qty * item.price)}`), '',
    ...costs.map(([label, value]) => `${label}: ${value}`), `*Total: ${money(total)}*`, '',
    ...details.map(([label, value]) => `${label}: ${value}`),
  ].join('\n');
  $('summary').hidden = true;
  $('copy-feedback').textContent = '';
  const ready = Boolean(live.phone && !live.demo);
  $('whatsapp').hidden = !ready;
  $('handoff-note').textContent = ready ? 'O WhatsApp vai abrir com a mensagem preenchida. Toque em Enviar para o restaurante receber o pedido.' :
    live.demo ? 'Este cardápio é de exemplo. Você pode copiar o resumo para testar.' : 'O WhatsApp do restaurante ainda não está disponível. Você pode copiar o resumo.';
}

async function reviewOrder(button, sending = false) {
  const session = checkoutSession;
  const error = $('checkout-error');
  const notice = $('receipt-notice');
  const previousPhone = state.menu.phone;
  error.textContent = '';
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try {
    const live = await api('/api/menu');
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
$('summary-copy').addEventListener('click',async()=>{
  try { await navigator.clipboard.writeText($('summary').value); $('copy-feedback').textContent='Resumo copiado.'; }
  catch { $('summary').hidden = false; $('summary').focus(); $('summary').select(); $('copy-feedback').textContent='Selecione e copie o texto do resumo.'; }
});

checkout.querySelector('[data-close]').addEventListener('click',event=>{
  if (event.detail===0) checkout.removeAttribute('data-motion');
  checkout.close();
});

try { state.menu=await api('/api/menu'); renderMenu(); renderCart(); }
catch { $('empty-menu').textContent='Não foi possível carregar o cardápio. Atualize a página para tentar novamente.'; }
