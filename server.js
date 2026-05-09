/**
 * IPTV M3U Server - Node.js
 * Serves playlists, checks stream health, and auto-updates channel lists.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { updateIPTV } = require('./lib/updater');
const { generatePlaylist } = require('./lib/playlist');
const { scheduleUpdates } = require('./lib/scheduler');
const { fetchAndCheckGitHub } = require('./lib/github-fetcher');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

function serveM3U(res, filePath, notFoundMsg) {
  if (!fs.existsSync(filePath)) return res.status(404).send(notFoundMsg + '\n');
  res.setHeader('Content-Type', 'application/x-mpegurl');
  res.sendFile(filePath);
}

app.get('/index.m3u',       (req, res) => serveM3U(res, path.join(DATA_DIR, 'index.m3u'),          '# Playlist not yet generated. POST /api/update first.'));
app.get('/dead.m3u',        (req, res) => serveM3U(res, path.join(DATA_DIR, 'index_dead.m3u'),     '# No dead channels recorded yet.'));
app.get('/playlist.m3u',    (req, res) => serveM3U(res, path.join(DATA_DIR, 'playlist.m3u'),       '# Playlist not yet generated.'));
app.get('/iptv-org.m3u',    (req, res) => serveM3U(res, path.join(DATA_DIR, 'iptv-org.m3u'),       '# International playlist not yet generated.'));
app.get('/github.m3u',      (req, res) => serveM3U(res, path.join(DATA_DIR, 'github-merged.m3u'),  '# GitHub playlist not yet generated. POST /api/github-fetch first.'));
app.get('/github-dead.m3u', (req, res) => serveM3U(res, path.join(DATA_DIR, 'github-dead.m3u'),   '# No dead GitHub channels recorded yet.'));

function serveJSON(res, reportPath, emptyMsg) {
  if (!fs.existsSync(reportPath)) return res.json({ message: emptyMsg });
  res.json(JSON.parse(fs.readFileSync(reportPath, 'utf-8')));
}

app.get('/api/stats',        (req, res) => serveJSON(res, path.join(DATA_DIR, 'report.json'),        'No report yet. POST /api/update first.'));
app.get('/api/github-stats', (req, res) => serveJSON(res, path.join(DATA_DIR, 'github-report.json'), 'No GitHub report yet. POST /api/github-fetch first.'));

// List all registered GitHub sources
app.get('/api/github-sources', (req, res) => {
  const { GITHUB_M3U_SOURCES } = require('./lib/github-sources');
  res.json({ total: GITHUB_M3U_SOURCES.length, sources: GITHUB_M3U_SOURCES });
});

app.post('/api/update', async (req, res) => {
  res.json({ message: 'Update started in background. Check /api/stats for progress.' });
  try { await updateIPTV(); } catch (err) { console.error('[server] update failed:', err.message); }
});

app.post('/api/generate-playlist', async (req, res) => {
  res.json({ message: 'Playlist generation started.' });
  try { await generatePlaylist(); } catch (err) { console.error('[server] playlist failed:', err.message); }
});

app.post('/api/github-fetch', async (req, res) => {
  res.json({ message: 'GitHub M3U fetch + stream check started in background. Check /api/github-stats for results.' });
  try { await fetchAndCheckGitHub(); } catch (err) { console.error('[server] GitHub fetch failed:', err.message); }
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[server] IPTV server running on port ${PORT}`);
  console.log(`  GET  /index.m3u          → Active channel playlist`);
  console.log(`  GET  /dead.m3u           → Dead channel list`);
  console.log(`  GET  /playlist.m3u       → Music + podcast playlist`);
  console.log(`  GET  /github.m3u         → Merged working GitHub channels ✨`);
  console.log(`  GET  /github-dead.m3u    → Dead GitHub channels`);
  console.log(`  GET  /api/stats          → Original update report`);
  console.log(`  GET  /api/github-stats   → GitHub fetch report`);
  console.log(`  GET  /api/github-sources → List of all registered GitHub repos`);
  console.log(`  POST /api/update         → Trigger original channel update`);
  console.log(`  POST /api/github-fetch   → Fetch ALL GitHub M3U repos + check streams ✨`);
  scheduleUpdates();
});
