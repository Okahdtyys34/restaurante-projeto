const $ = id => document.getElementById(id);
const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const cents = value => /^\d{1,5}([,.]\d{1,2})?$/.test(value.trim()) ? Math.round(Number(value.replace(',','.'))*100) : NaN;
const categories = ['Pratos','Bebidas','Sobremesas'];
let saved;
const draftKey = 'familia-cardapio-rascunho';
let baseline;
let draftBase;
let removed;
let fieldSequence = 0;
document.addEventListener('click', event => {
  const button = event.target.closest('button[type="submit"]');
  if (button) button.form.toggleAttribute('data-feedback-motion', event.detail > 0);
});
document.addEventListener('keydown', () => {
  document.querySelectorAll('[data-feedback-motion]').forEach(form => form.removeAttribute('data-feedback-motion'));
});

async function api(options) {
  const response = await fetch('/api/admin',options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível carregar o painel.');
  return data;
}

function addRow(item={name:'',description:'',category:'Pratos',price:null}) {
  const editor = $('editor-items');
  if (editor.children.length>=20) { $('editor-limit').textContent='O limite é de 20 itens.'; return; }
  $('editor-limit').textContent='';
  const row = document.createElement('div');
  const id = ++fieldSequence;
  const price = item.priceText ?? (item.price === null ? '' : (item.price / 100).toFixed(2).replace('.', ','));
  row.className = 'admin-row';
  row.innerHTML = `<div class="admin-row-head"><b>Item <span class="editor-number" aria-hidden="true"></span></b><button type="button" class="button secondary" data-remove>Remover</button></div>
    <div class="admin-row-main">
      <div><label for="item-name-${id}">Nome</label><input id="item-name-${id}" data-field="name" maxlength="70" value="${esc(item.name)}" required aria-describedby="item-name-error-${id}"><p id="item-name-error-${id}" class="field-error"></p></div>
      <div><label for="item-price-${id}">Preço em reais</label><input id="item-price-${id}" data-field="price" inputmode="decimal" maxlength="10" value="${esc(price)}" required aria-describedby="item-price-error-${id}"><p id="item-price-error-${id}" class="field-error"></p></div>
    </div>
    <details class="admin-details"><summary>Descrição e categoria</summary><div class="admin-row-bottom">
    <label>Descrição<input data-field="description" maxlength="160" value="${esc(item.description)}"></label>
    <label>Categoria<select data-field="category">${categories.map(category=>`<option${item.category===category?' selected':''}>${category}</option>`).join('')}</select></label></div></details>`;
  editor.append(row);
  return row;
}

function updateOverview() {
  const published = saved.day === saved.today;
  const menu = $('admin-status');
  menu.textContent = published ? `Publicado · ${saved.items.length} ${saved.items.length === 1 ? 'item' : 'itens'}` : 'Aguardando publicação';
  menu.toggleAttribute('data-ready', published);
  menu.removeAttribute('data-error');
  const contact = $('contact-state');
  contact.textContent = saved.phone ? 'Contato cadastrado' : 'Contato pendente';
  contact.toggleAttribute('data-ready', Boolean(saved.phone));
}

function collectItems() {
  return [...$('editor-items').children].map(row=>{
    const value = field => row.querySelector(`[data-field="${field}"]`).value;
    return {name:value('name'),description:value('description'),category:value('category'),priceText:value('price')};
  });
}

function updateDraft() {
  const items = collectItems();
  const dirty = JSON.stringify(items) !== baseline;
  const state = $('draft-state');
  state.hidden = $('discard-draft').hidden = !dirty;
  try {
    if (dirty) localStorage.setItem(draftKey, JSON.stringify({items, base:draftBase}));
    else localStorage.removeItem(draftKey);
    const outdated = draftBase !== JSON.stringify(saved.items);
    state.textContent = outdated
      ? 'Rascunho recuperado. O cardápio publicado mudou desde a última edição. Confira os pratos antes de publicar.'
      : 'Rascunho salvo neste navegador. Publique para atualizar o cardápio.';
  } catch {
    state.textContent = 'Alterações pendentes. Publique antes de sair para guardar suas edições.';
  }
  $('undo-removal').hidden = !removed;
  $('restore-item').disabled = items.length >= 20;
}

function fieldError(input, message) {
  if (message) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
  $(input.getAttribute('aria-describedby')).textContent = message;
}

function validateMenu(items) {
  const names = new Set();
  [...$('editor-items').children].forEach((row, index) => {
    const item = items[index];
    const key = item.name.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const price = cents(item.priceText);
    fieldError(row.querySelector('[data-field=name]'), !key ? 'Informe o nome do prato.' : names.has(key) ? 'Já existe um prato com este nome.' : '');
    fieldError(row.querySelector('[data-field=price]'), price >= 1 && price <= 999999 ? '' : 'Informe um preço entre R$ 0,01 e R$ 9.999,99.');
    names.add(key);
  });
}

function loadEditor(draft) {
  $('editor-items').replaceChildren();
  saved.items.forEach(addRow);
  baseline = JSON.stringify(collectItems());
  draftBase = JSON.stringify(saved.items);
  if (draft) {
    $('editor-items').replaceChildren();
    draft.items.forEach(addRow);
    draftBase = draft.base;
  }
  removed = undefined;
  updateDraft();
}

async function submit(event, action) {
  event.preventDefault();
  const status = $(action==='contact'?'contact-status':'menu-status');
  status.removeAttribute('data-success');
  status.textContent = '';
  const items = action === 'publish' ? collectItems() : undefined;
  let phone = saved.phone;
  let fee = saved.fee;
  if (action==='contact') {
    phone = $('phone').value.replace(/\D/g,'');
    if (phone.length===10 || phone.length===11) phone=`55${phone}`;
    fee = cents($('delivery-fee').value);
    fieldError($('phone'), phone && !/^55[1-9]\d[2-9]\d{7,8}$/.test(phone) ? 'Informe o WhatsApp com DDD e número.' : '');
    fieldError($('delivery-fee'), fee >= 0 && fee <= 99999 ? '' : 'Informe uma taxa válida. Use 0 para entrega grátis.');
  } else {
    if (!items.length) {
      status.textContent = 'Adicione pelo menos um item para publicar.';
      $('row-add').focus();
      return;
    }
    validateMenu(items);
  }
  const invalid = event.currentTarget.querySelector('[aria-invalid="true"]');
  if (invalid) {
    status.textContent = 'Confira os campos destacados.';
    invalid.focus();
    return;
  }
  const buttons = [...$('settings').querySelectorAll('[type=submit]')];
  buttons.forEach(button=>button.disabled=true);
  status.textContent='Salvando…';
  try {
    saved=await api({method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,phone,fee,
      items:items?.map(({priceText, ...item}) => ({...item, price:cents(priceText)})),revision:saved.revision})});
    updateOverview();
    if (items) {
      baseline = JSON.stringify(items);
      draftBase = JSON.stringify(saved.items);
      if (JSON.stringify(collectItems()) === baseline) loadEditor();
      else updateDraft();
    }
    status.setAttribute('data-success','');
    status.textContent=action==='contact'?'Contato e taxa salvos.':'Cardápio de hoje publicado.';
  } catch(error) { status.textContent=error.message; }
  finally { buttons.forEach(button=>button.disabled=false); }
}

$('contact-form').addEventListener('submit',event=>submit(event,'contact'));
$('menu-form').addEventListener('submit',event=>submit(event,'publish'));
$('settings').addEventListener('input', event => {
  if (event.target.hasAttribute('aria-invalid')) fieldError(event.target, '');
  if (event.target.closest('#editor-items')) updateDraft();
});
$('discard-draft').addEventListener('click', () => {
  loadEditor();
  $('row-add').focus();
});
$('row-add').addEventListener('click',()=>{
  addRow()?.querySelector('input')?.focus();
  updateDraft();
});
$('editor-items').addEventListener('click',event=>{
  if (!event.target.closest('[data-remove]')) return;
  const row = event.target.closest('.admin-row');
  removed = {row, next:row.nextElementSibling};
  $('removal-message').textContent = `${row.querySelector('[data-field=name]').value.trim() || 'Item'} removido do rascunho.`;
  row.remove();
  $('editor-limit').textContent='';
  updateDraft();
  $('restore-item').focus();
});
$('restore-item').addEventListener('click', () => {
  if (!removed || $('editor-items').children.length >= 20) return;
  $('editor-items').insertBefore(removed.row, removed.next);
  removed.row.querySelector('[data-field=name]').focus();
  removed = undefined;
  updateDraft();
});

function showPanel(moveFocus = false) {
  if ($('settings').hidden) return;
  const isContact = location.hash === '#contato';
  $('editor').hidden = isContact;
  $('contato').hidden = !isContact;
  for (const link of document.querySelectorAll('.management-nav a')) {
    if (link.hash === (isContact ? '#contato' : '#editor')) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
  if (moveFocus) {
    const heading = $(isContact ? 'contact-title' : 'editor-title');
    heading.focus({preventScroll:true});
    $(isContact ? 'contato' : 'editor').scrollIntoView({block:'start'});
  }
}
window.addEventListener('hashchange', () => showPanel(['#editor', '#contato'].includes(location.hash)));

try {
  saved=await api();
  $('phone').value=saved.phone?`+${saved.phone}`:'';
  $('delivery-fee').value=(saved.fee/100).toFixed(2).replace('.',',');
  let draft;
  try { draft = JSON.parse(localStorage.getItem(draftKey)); } catch { /* Storage can be unavailable. */ }
  loadEditor(Array.isArray(draft?.items) && draft.items.length <= 20 ? draft : null);
  updateOverview();
  $('settings').hidden=false;
  $('contact-jump').hidden=false;
  showPanel(location.hash === '#contato');
} catch(error) {
  $('admin-status').setAttribute('data-error', '');
  $('admin-status').textContent=error.message;
}
