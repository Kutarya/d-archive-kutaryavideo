const PAGE = 'https://kutarya.com/proje/kutarya-video';
const ENDPOINT = 'https://europe-west1-kutarya-ai-3169.cloudfunctions.net/gamesService';
function versionParts(version) {
  const match = typeof version === 'string' && version.match(/^(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/);
  return match ? match.slice(1).map(Number) : null;
}
function isNewer(remote, local) {
  const a = versionParts(remote), b = versionParts(local);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
async function checkUpdate(currentVersion, fetcher = fetch) {
  try {
    const response = await fetcher(ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { op: 'catalog' } }), cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error('Sürüm servisi yanıt vermedi.');
    const body = await response.text();
    if (body.length > 2 * 1024 * 1024) throw new Error('Sürüm yanıtı okunamadı.');
    const data = JSON.parse(body);
    const project = data.result?.games?.find(g => g.id === 'kutarya-video' && g.slug === 'kutarya-video' && g.status === 'published');
    if (data.error || !project || !versionParts(project.version)) throw new Error('Sürüm bilgisi bulunamadı.');
    return {
      status: isNewer(project.version, currentVersion) ? 'available' : 'current',
      version: project.version, currentVersion, page: PAGE, checkedAt: new Date().toISOString(),
    };
  } catch {
    return { status: 'offline', currentVersion, page: PAGE, message: 'Sürüm kontrolü yapılamadı. İnternet bağlantını kontrol edip yeniden deneyebilirsin.' };
  }
}
module.exports = { checkUpdate, isNewer, versionParts, PAGE, ENDPOINT };
