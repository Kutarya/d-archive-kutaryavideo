const $ = selector => document.querySelector(selector);
const ACTIVE = new Set(['queued', 'preparing', 'downloading', 'processing']);
const PAGE_SIZE = 20;
const labels = { queued: 'Sırada', preparing: 'Hazırlanıyor', downloading: 'İndiriliyor', processing: 'Birleştiriliyor', completed: 'Tamamlandı', failed: 'Tamamlanamadı', cancelled: 'İptal edildi' };
let state = { jobs: [], downloadDir: '', theme: 'light', version: '', update: { status: 'checking' } };
let view = 'downloads', page = 0, busy = false, inputTimer, toastTimer, dismissedUpdate = '';
let searching = false, searchSerial = 0, searchData = null;
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 4500); }
async function call(method, ...args) { const response = await window.kutarya[method](...args); if (!response.ok) { toast(response.error); return null; } return response.value; }
function size(bytes) { if (!(bytes > 0)) return '—'; const i = Math.min(3, Math.floor(Math.log(bytes) / Math.log(1024))); return `${(bytes / 1024 ** i).toLocaleString('tr', { maximumFractionDigits: 1 })} ${['B', 'KB', 'MB', 'GB'][i]}`; }
function duration(seconds) { if (!(seconds > 0)) return ''; const n = Math.floor(seconds); return n >= 3600 ? `${Math.floor(n / 3600)}:${String(Math.floor(n % 3600 / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}` : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; }
function node(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; }
function icon(name) { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), use = document.createElementNS(svg.namespaceURI, 'use'); use.setAttribute('href', `#i-${name}`); svg.setAttribute('aria-hidden', 'true'); svg.append(use); return svg; }
function action(label, callback, name, iconOnly = false) { const button = node('button', iconOnly ? 'icon-button' : 'button subtle'); button.title = label; button.setAttribute('aria-label', label); if (name) button.append(icon(name)); if (!iconOnly) button.append(document.createTextNode(label)); button.onclick = callback; return button; }
function jobNode(job) {
  const item = node('article', `job ${job.status}`); item.dataset.id = job.id;
  const thumb = node('div', 'job-thumb'); thumb.append(icon(job.status === 'completed' ? 'check' : job.status === 'failed' || job.status === 'cancelled' ? 'close' : 'arrow')); item.append(thumb);
  const body = node('div', 'job-body'), top = node('div', 'job-top'), heading = node('h3', '', job.title); heading.title = job.title;
  top.append(heading, node('span', 'job-status', labels[job.status])); body.append(top);
  const meta = node('div', 'job-meta'); meta.append(node('span', '', job.channel || 'YouTube')); if (job.duration) meta.append(node('span', '', duration(job.duration))); if (job.height) meta.append(node('span', '', `${job.height}p`)); body.append(meta);
  if (ACTIVE.has(job.status)) {
    const bar = node('div', 'progress-line'), fill = node('div'); fill.style.width = `${Math.max(0, Math.min(100, job.progress || 0))}%`; bar.append(fill); body.append(bar);
    const info = node('div', 'job-info');
    const progress = job.status === 'queued' ? 'Birazdan başlayacak' : job.status === 'preparing' ? 'Video bilgileri alınıyor…' : job.status === 'processing' ? 'Video ve ses birleştiriliyor…' : `${(job.progress || 0).toFixed(1)}% · ${size(job.downloadedBytes)}${job.totalBytes ? ` / ${size(job.totalBytes)}` : ''}`;
    info.append(node('span', '', progress), node('span', '', [job.speed ? `${size(job.speed)}/sn` : '', job.eta != null && job.status === 'downloading' ? `${duration(job.eta) || '0:00'} kaldı` : ''].filter(Boolean).join(' · '))); body.append(info);
  }
  if (job.status === 'completed') { const info = node('div', 'job-info', `${size(job.size)} · MP4 · Kaydedildi`); info.title = job.file || ''; body.append(info); }
  if (job.status === 'failed') {
    body.append(node('p', 'job-error', job.error)); const info = node('button', 'error-info', 'Hata bilgisi');
    info.onclick = () => { $('#error-summary').textContent = job.error; $('#error-detail').textContent = job.detail || 'Ayrıntı yok.'; $('#error-dialog').showModal(); }; body.append(info);
  }
  if (job.status === 'cancelled') body.append(node('p', 'job-error', 'İndirme durduruldu. Yeniden deneyebilirsin.'));
  item.append(body);
  const buttons = node('div', 'job-actions');
  if (job.status === 'completed') buttons.append(action('Videoyu aç', () => call('open', job.id), 'play'), action('Klasörde göster', () => call('reveal', job.id), 'folder', true));
  else if (['failed', 'cancelled'].includes(job.status)) buttons.append(action('Yeniden dene', () => call('retry', job.id)));
  else buttons.append(action('İndirmeyi iptal et', () => call('cancel', job.id), 'close', true));
  if (!ACTIVE.has(job.status)) buttons.append(action('Kaydı geçmişten sil', () => call('removeHistory', job.id), 'trash', true));
  [...buttons.children].forEach((button, i) => { button.dataset.focusKey = `${job.id}-${i}`; });
  item.append(buttons); return item;
}
function renderSearch() {
  $('#search-panel').hidden = !searching && !searchData;
  $('#search-loading').hidden = !searching;
  $('#search-cancel').textContent = searching ? 'Aramayı iptal et' : 'Sonuçları kapat';
  $('#search-title').textContent = searching ? 'Videoları buluyoruz' : 'Arama sonuçları';
  $('#search-description').textContent = searchData ? `“${searchData.query}” · İndirmek istediğin videoyu seç.` : 'Birazdan başlık ve kanal bilgileriyle görünecek.';
  $('#search-empty').hidden = searching || !searchData || searchData.results.length > 0;
  const cards = searching ? [] : (searchData?.results || []).map(result => {
    const card = node('article', 'result-card'); card.dataset.videoId = result.videoId;
    const cover = node('div', 'result-cover'), img = node('img'); img.src = result.thumbnail; img.alt = ''; img.loading = 'lazy'; img.onerror = () => { img.hidden = true; }; cover.append(img); if (result.duration) cover.append(node('span', 'result-duration', duration(result.duration))); card.append(cover);
    const body = node('div', 'result-body'), title = node('h3', '', result.title); title.title = result.title; body.append(title);
    const channel = node('p', 'result-channel', result.channel); channel.title = result.channel; body.append(channel);
    const inQueue = state.jobs.some(job => job.videoId === result.videoId && ACTIVE.has(job.status));
    const button = action(inQueue ? 'Kuyrukta' : 'İndir', () => enqueue(result.url), inQueue ? 'check' : 'arrow'); button.className = inQueue ? 'button subtle' : 'button primary'; button.disabled = inQueue; button.dataset.downloadId = result.videoId; body.append(button); card.append(body); return card;
  });
  $('#search-results').replaceChildren(...cards);
}
function render() {
  document.documentElement.dataset.theme = state.resolvedTheme || 'light';
  $('#theme-select').value = state.theme || 'light'; $('#version-tag').textContent = state.version ? `v${state.version}` : '';
  const active = state.jobs.filter(job => ACTIVE.has(job.status)), history = state.jobs.filter(job => !ACTIVE.has(job.status));
  const totalPages = Math.max(1, Math.ceil(history.length / PAGE_SIZE)); page = Math.min(page, totalPages - 1);
  const jobs = view === 'history' ? history.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) : [...active, ...history.slice(0, 1)];
  const focusKey = document.activeElement?.dataset.focusKey;
  $('#job-list').replaceChildren(...jobs.map(jobNode));
  if (focusKey) $(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
  $('#active-count').textContent = active.length; $('#history-count').textContent = history.length;
  $('#empty-state').hidden = jobs.length > 0;
  $('#empty-state h3').textContent = view === 'history' ? 'Geçmişin tertemiz.' : 'Bir video ile başlayalım.';
  $('#empty-state p').textContent = view === 'history' ? 'Biten işlemlerin kayıtları burada görünür.' : 'Yukarıya bir isim yaz veya bağlantı yapıştır.';
  $('#list-description').textContent = view === 'history' ? `${history.length} kayıt · Geçmişi temizlemek video dosyalarını silmez.` : active.length ? `${active.length} video sırayla indiriliyor. Yeni indirmeler aşağıda görünür.` : history.length ? 'Son işlem burada. Önceki kayıtların Geçmiş sekmesinde.' : 'İndirme başlayınca ilerlemeyi burada görebilirsin.';
  $('#clear-button').hidden = view !== 'history' || !history.length;
  $('#pagination').hidden = view !== 'history' || totalPages <= 1;
  $('#page-info').textContent = `${page + 1} / ${totalPages}`; $('#previous-page').disabled = page === 0; $('#next-page').disabled = page >= totalPages - 1;
  $('#save-path').textContent = state.downloadDir; $('#save-path').title = state.downloadDir;
  $('#directory-warning').hidden = !state.directoryWarning; $('#directory-warning').textContent = state.directoryWarning || '';
  $('#engine-status').replaceChildren(node('span', 'live-dot'), document.createTextNode(state.engineState === 'updating' ? 'İndirme motoru güncelleniyor' : active.length ? 'İndirme sürüyor' : 'İndirmeye hazır'));
  const update = state.update || {};
  $('#update-banner').hidden = update.status !== 'available' || dismissedUpdate === update.version;
  $('#update-title').textContent = `Kutarya Video ${update.version || ''} hazır!`;
  $('#check-update').textContent = update.status === 'available' ? `Yeni sürüm: ${update.version} ↗` : update.status === 'current' ? `Sürüm güncel · v${state.version}` : update.status === 'offline' ? 'Sürüm kontrol edilemedi · Yeniden dene' : 'Sürüm kontrol ediliyor…';
  $('#check-update').disabled = update.status === 'checking';
  document.title = active.length ? `(${active.length}) Kutarya Video` : 'Kutarya Video';
  renderSearch();
}
function looksLikeLink(text) { return /https?:\/\/|(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(text); }
function inputChanged() { const link = looksLikeLink($('#url-input').value); $('#submit-label').textContent = link ? 'İndir' : 'Video bul'; $('#submit-icon use').setAttribute('href', link ? '#i-arrow' : '#i-search'); }
async function enqueue(text) {
  if (busy) return; busy = true; $('#submit-button').disabled = true;
  try { const result = await call('add', text); if (result) { $('#url-input').value = ''; inputChanged(); toast(result.count ? `${result.count} video kuyruğa eklendi.` : 'Bu video zaten kuyrukta.'); } }
  finally { busy = false; $('#submit-button').disabled = false; }
}
async function submit() {
  clearTimeout(inputTimer); const text = $('#url-input').value.trim();
  if (!text) { $('#url-input').focus(); return; }
  if (looksLikeLink(text)) return enqueue(text);
  const serial = ++searchSerial; searching = true; searchData = null; renderSearch();
  const response = await window.kutarya.search(text);
  if (serial !== searchSerial) return;
  searching = false;
  if (response.ok) { searchData = response.value; if (!searchData.results.length) toast('Video bulunamadı. Başka bir isimle deneyebilirsin.'); }
  else if (response.code !== 'SEARCH_CANCELLED') toast(response.error);
  renderSearch();
}
function paste(text) {
  if (!text?.trim()) { toast('Pano boş. Bir video adı veya YouTube bağlantısı kopyala.'); return; }
  clearTimeout(inputTimer); $('#url-input').value = text; inputChanged(); if (looksLikeLink(text)) void enqueue(text); else $('#url-input').focus();
}
$('#download-form').onsubmit = event => { event.preventDefault(); void submit(); };
$('#url-input').addEventListener('paste', event => { const text = event.clipboardData?.getData('text'); if (text?.trim()) { event.preventDefault(); paste(text); } });
$('#url-input').addEventListener('input', () => { clearTimeout(inputTimer); inputChanged(); if (looksLikeLink($('#url-input').value)) inputTimer = setTimeout(() => void submit(), 1100); });
$('#url-input').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(); } });
$('#paste-button').onclick = async () => { const text = await call('paste'); if (text !== null) paste(text); };
$('#search-cancel').onclick = () => { ++searchSerial; searching = false; searchData = null; void call('cancelSearch'); renderSearch(); };
$('#choose-folder').onclick = async () => { const result = await call('chooseFolder'); if (result && !result.cancelled) toast('Kayıt klasörü değişti. Yeni eklediğin videolar buraya inecek.'); };
$('#open-folder').onclick = () => call('folder');
$('#theme-select').onchange = () => call('theme', $('#theme-select').value);
$('#clear-button').onclick = () => $('#clear-dialog').showModal();
$('#clear-confirm').onclick = async () => { const result = await call('clear'); $('#clear-dialog').close(); if (result) toast(`${result.count} kayıt temizlendi. Video dosyaların duruyor.`); };
for (const id of ['clear-cancel', 'clear-dialog-close']) $(`#${id}`).onclick = () => $('#clear-dialog').close();
$('#dialog-close').onclick = () => $('#error-dialog').close();
$('#minimize').onclick = () => window.kutarya.minimize(); $('#maximize').onclick = () => window.kutarya.maximize(); $('#close').onclick = () => window.kutarya.close();
document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => {
  view = button.dataset.view; page = 0;
  document.querySelectorAll('[data-view]').forEach(other => { other.classList.toggle('selected', other === button); other.setAttribute('aria-selected', String(other === button)); });
  $('#job-panel').setAttribute('aria-labelledby', button.id); render();
});
$('#previous-page').onclick = () => { page = Math.max(0, page - 1); render(); };
$('#next-page').onclick = () => { ++page; render(); };
$('#update-open').onclick = () => call('website');
$('#update-dismiss').onclick = () => { dismissedUpdate = state.update.version; render(); };
$('#check-update').onclick = async () => { dismissedUpdate = ''; const result = await call('checkUpdate'); if (result?.status === 'offline') toast(result.message); };
window.kutarya.onChange(value => { state = value; render(); });
window.addEventListener('unhandledrejection', event => { toast('İşlem tamamlanamadı. Yeniden dene.'); console.error(event.reason); });
(async () => { const value = await call('state'); if (value) { state = value; render(); window.uiReady = true; } })();
