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
let pendingPhotos = 0;
const nameKey = name => name.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/\p{Diacritic}/gu, '');
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
  row.promotionDraft = Boolean(item.promotionDraft);
  row.innerHTML = `<div class="admin-row-head"><b>Item <span class="editor-number" aria-hidden="true"></span></b><button type="button" class="button secondary" data-remove>Remover</button></div>
    <div class="admin-row-main">
      <div><label for="item-name-${id}">Nome</label><input id="item-name-${id}" data-field="name" maxlength="70" value="${esc(item.name)}" required aria-describedby="item-name-error-${id}"><p id="item-name-error-${id}" class="field-error"></p></div>
      <div><label for="item-price-${id}">Preço em reais</label><input id="item-price-${id}" data-field="price" inputmode="decimal" maxlength="10" value="${esc(price)}" required aria-describedby="item-price-error-${id}"><p id="item-price-error-${id}" class="field-error"></p></div>
    </div>
    <details class="admin-details"><summary>Descrição e categoria</summary><div class="admin-row-bottom">
    <label>Descrição<input data-field="description" maxlength="160" value="${esc(item.description)}"></label>
    <label>Categoria<select data-field="category">${categories.map(category=>`<option${item.category===category?' selected':''}>${category}</option>`).join('')}</select></label></div></details>`;
  row.photo = item.photo ?? '';
  row.promotionPhoto = item.promotionPhoto ?? '';
  row.defaultPhotoURL = item.imageUrl ?? '';
  const photo = document.createElement('div');
  photo.className = 'product-photo-field';
  photo.innerHTML = '<img alt="" width="72" height="72" hidden><div><label>Foto do produto<input type="file" accept="image/*"></label><button type="button" class="link-button" hidden>Remover foto</button><p class="field-error" role="status"></p></div>';
  setupPhotoField(row, photo);
  row.querySelector('details').append(photo);
  row.querySelector('summary').textContent = 'Descrição, categoria e foto';
  const offers = document.createElement('details');
  offers.className = 'admin-details';
  const original = item.originalPriceText ?? (item.originalPrice ? (item.originalPrice/100).toFixed(2).replace('.',',') : '');
  const bundle = item.bundleText ?? (item.bundle ?? []).join('\n');
  offers.innerHTML = `<summary>Promoção e combo</summary>
    <label for="original-price-${id}">Preço antigo (opcional)</label>
    <input id="original-price-${id}" data-field="originalPrice" inputmode="decimal" maxlength="10" value="${esc(original)}" aria-describedby="original-error-${id}">
    <p id="original-error-${id}" class="field-error"></p>
    <p class="cart-note">Para anunciar uma promoção, coloque o preço atual no campo Preço e o valor anterior aqui.</p>
    <label for="bundle-${id}">Itens do combo (opcional)</label>
    <textarea id="bundle-${id}" data-field="bundle" rows="3" maxlength="1000" aria-describedby="bundle-error-${id}" placeholder="1 feijoada&#10;1 suco">${esc(bundle)}</textarea>
    <p id="bundle-error-${id}" class="field-error"></p>
    <p class="cart-note">Um item por linha, com a quantidade. O preço do produto será o valor do combo.</p>`;
  row.offers = offers;
  offers.productRow = row;
  const promotionFields = document.createElement('div');
  promotionFields.innerHTML = `<label for="offer-name-${id}">Nome da promoção</label><input id="offer-name-${id}" data-offer-name maxlength="70" value="${esc(item.name)}">
    <label for="offer-price-${id}">Preço do pacote em reais</label><input id="offer-price-${id}" data-offer-price inputmode="decimal" maxlength="10" value="${esc(price)}">
    <fieldset class="offer-picker"><legend>Produtos do pacote</legend><div data-offer-products></div></fieldset>
    <button type="button" class="link-button" data-offer-remove>Remover promoção</button>`;
  offers.append(promotionFields);
  offers.querySelector('[data-field=bundle]').hidden = true;
  offers.querySelector(`label[for="bundle-${id}"]`).hidden = true;
  offers.querySelectorAll('.cart-note').forEach(element=>element.hidden = true);
  const offerPhoto = document.createElement('div');
  offerPhoto.className = 'product-photo-field';
  offerPhoto.innerHTML = '<img alt="" width="72" height="72" hidden><div><label>Imagem da promoção<input type="file" accept="image/*"></label><button type="button" class="link-button" hidden>Usar foto do produto</button><p class="field-error" role="status"></p></div>';
  offers.querySelector('summary').after(offerPhoto);
  setupPhotoField({
    get photo() { return row.promotionPhoto; },
    set photo(value) { row.promotionPhoto = value; },
  }, offerPhoto);
  row.offerImage = offerPhoto.querySelector('img');
  $('offers-list').append(offers);
  const addons = document.createElement('details');
  addons.className = 'admin-details addon-editor';
  addons.innerHTML = `<summary>Adicionais <span data-addon-count></span></summary>
    <p class="cart-note">Inclua os complementos deste produto. Use 0 para adicionais grátis.</p>
    <div data-addon-list></div>
    <button type="button" class="button secondary" data-addon-add>Adicionar complemento</button>
    <p class="cart-note" data-addon-limit hidden>Limite de 10 adicionais por produto.</p>`;
  row.append(addons);
  for (const addon of item.addons ?? []) addAddon(addons, addon);
  updateAddonEditor(addons);
  editor.append(row);
  return row;
}

function addAddon(editor, addon = {name:'', priceText:''}) {
  const id = ++fieldSequence;
  const price = addon.priceText ?? (addon.price / 100).toFixed(2).replace('.', ',');
  const row = document.createElement('div');
  row.className = 'addon-editor-row';
  row.innerHTML = `<div><label for="addon-name-${id}">Nome do adicional</label><input id="addon-name-${id}" data-addon-name required maxlength="60" value="${esc(addon.name)}" aria-describedby="addon-name-error-${id}"><p id="addon-name-error-${id}" class="field-error"></p></div>
    <div><label for="addon-price-${id}">Preço em reais</label><input id="addon-price-${id}" data-addon-price required maxlength="10" inputmode="decimal" value="${esc(price)}" aria-describedby="addon-price-error-${id}"><p id="addon-price-error-${id}" class="field-error"></p></div>
    <button type="button" class="link-button" data-addon-remove>Remover adicional</button>`;
  editor.querySelector('[data-addon-list]').append(row);
  return row;
}

function updateAddonEditor(editor) {
  const count = editor.querySelector('[data-addon-list]').children.length;
  editor.querySelector('[data-addon-count]').textContent = count ? `(${count})` : '';
  editor.querySelector('[data-addon-add]').disabled = count >= 10;
  editor.querySelector('[data-addon-limit]').hidden = count < 10;
}

async function compressPhoto(file) {
  if (file.size > 12 * 1024 * 1024) throw new Error('Escolha uma foto de até 12 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try { await image.decode(); }
    catch { throw new Error('Não consegui ler esta foto. Tente JPG, PNG ou WebP.'); }
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', {alpha:false});
    const ratio = Math.min(1, 600 / Math.max(image.naturalWidth, image.naturalHeight));
    for (const scale of [1, .75, .5, .35]) {
      canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio * scale));
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL('image/jpeg', .76).split(',')[1];
      if (base64 && base64.length <= 49152) return base64;
    }
    throw new Error('Não consegui reduzir a foto. Escolha outra imagem.');
  } finally { URL.revokeObjectURL(url); }
}

function setupPhotoField(row, field) {
  const input = field.querySelector('input');
  const image = field.querySelector('img');
  const remove = field.querySelector('button');
  const status = field.querySelector('[role=status]');
  function showPhoto() {
    image.hidden = remove.hidden = !row.photo;
    if (row.photo) image.src = 'data:image/jpeg;base64,' + row.photo;
    else image.removeAttribute('src');
  }
  showPhoto();
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    pendingPhotos++;
    input.disabled = remove.disabled = true;
    status.textContent = 'Preparando foto…';
    try {
      row.photo = await compressPhoto(file);
      showPhoto();
      updateDraft();
      status.textContent = 'Foto pronta para publicar.';
    } catch (error) { status.textContent = error.message; }
    finally {
      pendingPhotos--;
      input.value = '';
      input.disabled = remove.disabled = false;
    }
  });
  remove.addEventListener('click', () => {
    row.photo = '';
    showPhoto();
    updateDraft();
    input.focus();
    status.textContent = 'Foto removida do rascunho.';
  });
}

function updateOverview() {
  const published = saved.day === saved.today;
  const menu = $('admin-status');
  menu.textContent = published ? `Publicado · ${saved.items.length} ${saved.items.length === 1 ? 'item' : 'itens'}` : 'Aguardando publicação';
  menu.toggleAttribute('data-ready', published);
  menu.removeAttribute('data-error');
  const contact = $('contact-state');
  contact.textContent = saved.phone ? 'WhatsApp cadastrado' : 'WhatsApp pendente';
  contact.toggleAttribute('data-ready', Boolean(saved.phone));
  $('wait-state').textContent = saved.waitMinutes ? saved.waitMinutes + ' min' : 'Não informada';
  $('pix-state').textContent = saved.pixKey ? 'Pix cadastrado' : 'Pix sem chave';
  if (saved.today) {
    const date = new Date(saved.today + 'T12:00:00Z');
    $('dashboard-date').textContent = new Intl.DateTimeFormat('pt-BR', {
      dateStyle:'long', timeZone:'UTC',
    }).format(date);
    $('dashboard-date').hidden = false;
  }
}

function collectItems() {
  return [...$('editor-items').children].map(row=>{
    const value = field => (row.querySelector(`[data-field="${field}"]`) || row.offers.querySelector(`[data-field="${field}"]`)).value;
    const addons = [...row.querySelector('[data-addon-list]').children].map(addon=>({
      name:addon.querySelector('[data-addon-name]').value,
      priceText:addon.querySelector('[data-addon-price]').value,
    }));
    return {name:value('name'),description:value('description'),category:value('category'),priceText:value('price'),photo:row.photo,promotionPhoto:row.promotionPhoto,addons,promotionDraft:row.promotionDraft,originalPriceText:value('originalPrice'),bundleText:value('bundle')};
  });
}

function updateDraft() {
  const rows = [...$('editor-items').children];
  const panels = rows.map(row=>row.offers);
  for (const panel of [...$('offers-list').children]) if (!panels.includes(panel)) panel.remove();
  for (const [index,row] of rows.entries()) {
    const imageURL = row.promotionPhoto || row.photo;
    const src = imageURL ? 'data:image/jpeg;base64,' + imageURL : row.defaultPhotoURL;
    row.offerImage.hidden = !src;
    if (src) row.offerImage.src = src;
    else row.offerImage.removeAttribute('src');
    if (!row.offers.isConnected) $('offers-list').append(row.offers);
    row.offers.querySelector('summary').textContent = row.querySelector('[data-field=name]').value.trim() || `Produto ${index+1}`;
    const active = row.promotionDraft || row.offers.querySelector('[data-field=bundle]').value.trim() || row.offers.querySelector('[data-field=originalPrice]').value.trim();
    row.offers.hidden = !active;
    for (const [source,target] of [['name','offerName'],['price','offerPrice']]) {
      const input = row.offers.querySelector(target==='offerName'?'[data-offer-name]':'[data-offer-price]');
      if (document.activeElement !== input) input.value = row.querySelector(`[data-field="${source}"]`).value;
    }
  }
  $('offers-empty').hidden = panels.some(panel=>!panel.hidden);
  const items = collectItems();
  const count = items.length + (items.length === 1 ? ' produto' : ' produtos');
  if ($('editor-count').textContent !== count) $('editor-count').textContent = count;
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
  $(input.getAttribute('aria-describedby').split(' ')[0]).textContent = message;
}

function renderOfferPicker(panel) {
  const selected = new Map(panel.querySelector('[data-field=bundle]').value.split('\n').filter(Boolean).map(line=>{
    const match = /^(\d+)\s+(.+)$/.exec(line);
    return [match ? match[2] : line, match ? Number(match[1]) : 1];
  }));
  const products = [...$('editor-items').children].filter(row=>row !== panel.productRow && !row.offers.querySelector('[data-field=bundle]').value.trim() && !row.promotionDraft);
  const names = [...new Set([...products.map(row=>row.querySelector('[data-field=name]').value.trim()).filter(Boolean),...selected.keys()])];
  panel.querySelector('[data-offer-products]').innerHTML = names.map((name,index)=>{
    const id = panel.querySelector('[data-offer-name]').id + '-product-' + index;
    return `<div class="offer-product"><label for="${id}"><input id="${id}" type="checkbox" data-offer-select value="${esc(name)}" ${selected.has(name)?'checked':''}> ${esc(name)}</label>
      <label class="sr-only" for="${id}-qty">Quantidade de ${esc(name)}</label><input id="${id}-qty" data-offer-quantity type="number" min="1" max="20" step="1" value="${selected.get(name) ?? 1}" aria-label="Quantidade de ${esc(name)}" ${selected.has(name)?'':'disabled'}></div>`;
  }).join('') || '<p class="cart-note">Cadastre produtos no Cardápio para selecionar aqui.</p>';
}

$('offer-add').addEventListener('click',()=>{
  const row = addRow({name:'',description:'',category:'Pratos',price:null,promotionDraft:true});
  if (!row) {
    $('offers-status').textContent = 'O limite é de 20 produtos, incluindo promoções.';
    return;
  }
  row.offers.open = true;
  updateDraft();
  renderOfferPicker(row.offers);
  row.offers.querySelector('[data-offer-name]').focus();
});
$('offers-list').addEventListener('input',event=>{
  const panel = event.target.closest('details');
  if (!panel) return;
  const row = panel.productRow;
  if (event.target.matches('[data-offer-name]')) row.querySelector('[data-field=name]').value = event.target.value;
  if (event.target.matches('[data-offer-price]')) row.querySelector('[data-field=price]').value = event.target.value;
  if (event.target.matches('[data-offer-select], [data-offer-quantity]')) {
    const lines = [];
    for (const option of panel.querySelectorAll('.offer-product')) {
      const check = option.querySelector('[data-offer-select]');
      const quantity = option.querySelector('[data-offer-quantity]');
      quantity.disabled = !check.checked;
      if (check.checked) lines.push(`${quantity.value} ${check.value}`);
    }
    panel.querySelector('[data-field=bundle]').value = lines.join('\n');
  }
  updateDraft();
});
$('offers-list').addEventListener('click',event=>{
  if (!event.target.closest('[data-offer-remove]')) return;
  const panel = event.target.closest('details');
  const row = panel.productRow;
  if (row.promotionDraft || panel.querySelector('[data-field=bundle]').value.trim()) row.remove();
  else {
    panel.querySelector('[data-field=originalPrice]').value = '';
    row.promotionPhoto = '';
  }
  updateDraft();
  $('offer-add').focus();
});

function validateMenu(items) {
  const names = new Set();
  [...$('editor-items').children].forEach((row, index) => {
    const item = items[index];
    const key = nameKey(item.name);
    const price = cents(item.priceText);
    const original = cents(item.originalPriceText);
    fieldError(row.offers.querySelector('[data-field=originalPrice]'), !item.originalPriceText.trim() || (original > price && original <= 999999) ? '' : 'O preço antigo deve ser maior que o preço atual.');
    const bundle = item.bundleText.split('\n').map(line=>line.trim()).filter(Boolean);
    const quantitiesValid = [...row.offers.querySelectorAll('.offer-product')].every(option=>{
      const checked = option.querySelector('[data-offer-select]').checked;
      const quantity = option.querySelector('[data-offer-quantity]').valueAsNumber;
      return !checked || (Number.isInteger(quantity) && quantity>=1 && quantity<=20);
    });
    const bundleError = row.promotionDraft && !bundle.length ? 'Selecione os produtos da promoção.' :
      bundle.length > 10 ? 'Selecione até 10 produtos.' : !quantitiesValid ? 'Use quantidades inteiras de 1 a 20.' : '';
    fieldError(row.offers.querySelector('[data-field=bundle]'), bundleError);
    fieldError(row.querySelector('[data-field=name]'), !key ? 'Informe o nome do prato.' : names.has(key) ? 'Já existe um prato com este nome.' : '');
    fieldError(row.querySelector('[data-field=price]'), price >= 1 && price <= 999999 ? '' : 'Informe um preço entre R$ 0,01 e R$ 9.999,99.');
    names.add(key);
    const addonNames = new Set();
    [...row.querySelector('[data-addon-list]').children].forEach((addonRow, addonIndex) => {
      const addon = item.addons[addonIndex];
      const addonKey = nameKey(addon.name);
      const addonPrice = cents(addon.priceText);
      fieldError(addonRow.querySelector('[data-addon-name]'), !addonKey ? 'Informe o nome do adicional.' : addonNames.has(addonKey) ? 'Já existe um adicional com este nome no produto.' : '');
      fieldError(addonRow.querySelector('[data-addon-price]'), addonPrice >= 0 && addonPrice <= 999999 ? '' : 'Informe um preço de R$ 0,00 a R$ 9.999,99.');
      addonNames.add(addonKey);
    });
  });
}

function loadEditor(draft) {
  $('offers-list').replaceChildren();
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
  const status = $(action==='contact'?'contact-status':location.hash==='#promocoes'?'offers-status':'menu-status');
  status.removeAttribute('data-success');
  status.textContent = '';
  const items = action === 'publish' ? collectItems() : undefined;
  let phone = saved.phone;
  let fee = saved.fee;
  let waitMinutes;
  let pixKey;
  if (action==='contact') {
    phone = $('phone').value.replace(/\D/g,'');
    if (phone.length===10 || phone.length===11) phone=`55${phone}`;
    fee = cents($('delivery-fee').value);
    fieldError($('phone'), phone && !/^55[1-9]\d[2-9]\d{7,8}$/.test(phone) ? 'Informe o WhatsApp com DDD e número.' : '');
    fieldError($('delivery-fee'), fee >= 0 && fee <= 99999 ? '' : 'Informe uma taxa válida. Use 0 para entrega grátis.');
    const wait = $('wait-minutes');
    waitMinutes = wait.value ? wait.valueAsNumber : null;
    pixKey = $('pix-key').value.trim();
    const invalidWait = wait.validity.badInput || (waitMinutes !== null && (!Number.isInteger(waitMinutes) || waitMinutes < 1 || waitMinutes > 600));
    fieldError(wait, invalidWait ? 'Informe um número inteiro de 1 a 600.' : '');
    fieldError($('pix-key'), pixKey.length > 100 ? 'Use uma chave de até 100 caracteres.' : '');
  } else {
    if (pendingPhotos) {
      status.textContent = 'Aguarde até que as fotos fiquem prontas.';
      return;
    }
    if (!items.length) {
      status.textContent = 'Adicione pelo menos um item para publicar.';
      $('row-add').focus();
      return;
    }
    validateMenu(items);
  }
  const invalid = action === 'contact' ? event.currentTarget.querySelector('[aria-invalid="true"]') :
    $('settings').querySelector('#editor [aria-invalid="true"], #promocoes [aria-invalid="true"]');
  if (invalid) {
    status.textContent = 'Confira os campos destacados.';
    const target = invalid.closest('#promocoes') ? '#promocoes' : '#editor';
    if (location.hash !== target) { history.replaceState(null,'',target); showPanel(); }
    const details = invalid.closest('details');
    if (details) details.open = true;
    (invalid.hidden ? invalid.closest('details').querySelector('[data-offer-name]') : invalid).focus();
    return;
  }
  const buttons = [...$('settings').querySelectorAll('[type=submit]')];
  buttons.forEach(button=>button.disabled=true);
  status.textContent='Salvando…';
  try {
    saved=await api({method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,phone,fee,waitMinutes,pixKey,
      items:items?.map(({priceText, addons, originalPriceText, bundleText, ...item}) => ({...item, price:cents(priceText),
        originalPrice:originalPriceText.trim() ? cents(originalPriceText) : null,
        bundle:bundleText.split('\n').map(line=>line.trim()).filter(Boolean),
        addons:addons.map(addon=>({name:addon.name, price:cents(addon.priceText)}))})),revision:saved.revision})});
    updateOverview();
    if (items) {
      baseline = JSON.stringify(items);
      draftBase = JSON.stringify(saved.items);
      if (JSON.stringify(collectItems()) === baseline) loadEditor();
      else updateDraft();
    }
    status.setAttribute('data-success','');
    status.textContent=action==='contact'?'Configurações salvas.':'Cardápio de hoje publicado.';
  } catch(error) { status.textContent=error.message; }
  finally { buttons.forEach(button=>button.disabled=false); }
}

$('contact-form').addEventListener('submit',event=>submit(event,'contact'));
$('menu-form').addEventListener('submit',event=>submit(event,'publish'));
$('settings').addEventListener('input', event => {
  if (event.target.hasAttribute('aria-invalid')) fieldError(event.target, '');
  if (event.target.closest('#editor-items, #offers-list')) updateDraft();
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
  const add = event.target.closest('[data-addon-add]');
  const deleteAddon = event.target.closest('[data-addon-remove]');
  if (add || deleteAddon) {
    const editor = event.target.closest('.addon-editor');
    const list = editor.querySelector('[data-addon-list]');
    if (deleteAddon) {
      deleteAddon.closest('.addon-editor-row').remove();
      updateAddonEditor(editor);
      editor.querySelector('[data-addon-add]').focus();
    } else if (list.children.length < 10) {
      const input = addAddon(editor).querySelector('input');
      updateAddonEditor(editor);
      input.focus();
    }
    updateDraft();
    return;
  }
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
  const active = ['#contato','#promocoes'].includes(location.hash) ? location.hash.slice(1) : 'editor';
  for (const id of ['editor','contato','promocoes']) $(id).hidden = id !== active;
  if (active === 'promocoes') for (const panel of $('offers-list').children) if (!panel.hidden) renderOfferPicker(panel);
  for (const link of document.querySelectorAll('.management-nav a')) {
    if (link.hash === '#' + active) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
  if (moveFocus) {
    const heading = $(active==='contato'?'contact-title':active==='promocoes'?'promocoes-title':'editor-title');
    heading.focus({preventScroll:true});
    $(active).scrollIntoView({block:'start'});
  }
}
window.addEventListener('hashchange', () => showPanel(['#editor', '#contato','#promocoes'].includes(location.hash)));

try {
  saved=await api();
  $('phone').value=saved.phone?`+${saved.phone}`:'';
  $('delivery-fee').value=(saved.fee/100).toFixed(2).replace('.',',');
  $('wait-minutes').value = saved.waitMinutes ?? '';
  $('pix-key').value = saved.pixKey ?? '';
  let draft;
  try { draft = JSON.parse(localStorage.getItem(draftKey)); } catch { /* Storage can be unavailable. */ }
  loadEditor(Array.isArray(draft?.items) && draft.items.length <= 20 ? draft : null);
  updateOverview();
  $('settings').hidden=false;
  document.querySelector('.management-nav').hidden = false;
  showPanel(location.hash === '#contato');
} catch(error) {
  $('admin-status').setAttribute('data-error', '');
  $('admin-status').textContent=error.message;
}
