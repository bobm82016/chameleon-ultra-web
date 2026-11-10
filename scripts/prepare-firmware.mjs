import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const upstream = 'https://api.github.com/repos/RfidResearchGroup/ChameleonUltra/releases?per_page=50';
const headers = { 'User-Agent': 'chameleon-ultra-web', Accept: 'application/vnd.github+json' };
async function request(url) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(url + ': HTTP ' + response.status);
  return response;
}
const releases = await (await request(upstream)).json();
const selected = releases.filter(r => !r.draft && !r.prerelease && /^v\d+\.\d+\.\d+$/.test(r.tag_name))
  .map(r => ({ release: r, asset: r.assets.find(a => a.name === 'ultra-dfu-app.zip' && a.state === 'uploaded') }))
  .filter(r => r.asset).sort((a,b) => b.release.tag_name.slice(1).localeCompare(a.release.tag_name.slice(1), undefined, { numeric: true }));
if (!selected.length) throw new Error('No official Ultra application firmware found');
const manifest = { generatedAt: new Date().toISOString(), releases: [] };
for (const { release, asset } of selected) {
  const tag = release.tag_name;
  const expectedUrl = 'https://github.com/RfidResearchGroup/ChameleonUltra/releases/download/' + tag + '/ultra-dfu-app.zip';
  if (asset.browser_download_url !== expectedUrl) throw new Error('Unexpected firmware source');
  const bytes = Buffer.from(await (await request(expectedUrl)).arrayBuffer());
  if (bytes.length !== asset.size || bytes.length < 1 || bytes.length > 5000000) throw new Error('Firmware size mismatch: ' + tag);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (asset.digest && asset.digest !== 'sha256:' + sha256) throw new Error('Official digest mismatch: ' + tag);
  const directory = 'firmware/' + tag;
  await mkdir(directory, { recursive: true });
  await writeFile(directory + '/ultra-dfu-app.zip', bytes);
  manifest.releases.push({ tag, file: directory + '/ultra-dfu-app.zip', size: bytes.length, sha256, source: release.html_url });
}
await writeFile('firmware/index.json', JSON.stringify(manifest, null, 2) + '\n');
console.log('Prepared ' + manifest.releases.length + ' official Ultra firmware versions');
