// Read the channel's Videos tab so previews follow new full-length uploads.
export function extractEpisodes(html) {
  const match = html.match(/var ytInitialData = (.*?);<\/script>/s);
  if (!match) return [];
  const found = [];
  const seen = new Set();
  const add = (id, title) => {
    if (!/^[\w-]{11}$/.test(id || '') || seen.has(id)) return;
    seen.add(id);
    found.push({ id, title: String(title || 'Try Jesus Media episode') });
  };
  const walk = node => {
    if (!node || typeof node !== 'object' || found.length >= 3) return;
    const video = node.videoRenderer;
    if (video) add(video.videoId, video.title?.runs?.map(run => run.text).join(''));
    const lockup = node.lockupViewModel;
    if (lockup?.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') {
      add(lockup.contentId, lockup.metadata?.lockupMetadataViewModel?.title?.content);
    }
    Object.values(node).forEach(walk);
  };
  walk(JSON.parse(match[1]));
  return found.slice(0, 3);
}

export async function onRequestGet() {
  try {
    const response = await fetch('https://www.youtube.com/@TryJesusMedia/videos', {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US,en;q=0.9' },
      signal: AbortSignal.timeout(8000),
      cf: { cacheTtl: 3600, cacheEverything: true },
    });
    if (!response.ok) throw new Error('Channel unavailable');
    const episodes = extractEpisodes(await response.text());
    if (episodes.length !== 3) throw new Error('Channel previews unavailable');
    return Response.json(episodes, { headers: { 'Cache-Control': 'public, max-age=3600' } });
  } catch {
    return Response.json({ error: 'Use the page previews' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
