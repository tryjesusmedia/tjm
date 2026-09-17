import { completedCourseLessons } from './bd-quiz-progress.js';
const RECIPIENT = 'kalmanroller@gmail.com';
export async function notifyCourseCompletion(env, user, readCheckoutPhone) {
  const db = env.BD_DB;
  if (await completedCourseLessons(db, user.id) !== 6) return;
  await db.prepare('CREATE TABLE IF NOT EXISTS bd_completion_notifications (user_id TEXT PRIMARY KEY, payload TEXT NOT NULL, event_sent_at TEXT, lease_until INTEGER NOT NULL DEFAULT 0)').run();
  const existing = await db.prepare('SELECT user_id FROM bd_completion_notifications WHERE user_id=?').bind(user.id).first();
  if (!existing) {
    const phone = String(user.phone || await readCheckoutPhone() || '').trim();
    const email = String(user.email || '').trim().toLowerCase();
    const name = String(user.user_metadata?.full_name || user.user_metadata?.name || email).slice(0, 120);
    const payload = {
      eventName: 'bible decoded completed',
      eventID: crypto.randomUUID(),
      eventTime: new Date().toISOString(),
      origin: 'api',
      contact: {email: RECIPIENT},
      properties: {
        program: 'Bible Decoded',
        student_name: name,
        student_email: email,
        student_phone: phone || 'Not provided',
        message: 'Someone completed this course: Bible Decoded.',
      },
    };
    await db.prepare('INSERT OR IGNORE INTO bd_completion_notifications(user_id,payload) VALUES (?,?)').bind(user.id, JSON.stringify(payload)).run();
  }
  // Keep events queued until the administrator email workflow is enabled.
  if (env.BD_COMPLETION_NOTIFY_ENABLED !== 'true' || !env.OMNISEND_API_KEY) return;
  // Subsequent member visits also retry a small batch of previously queued events.
  const now = Date.now();
  const rows = (await db.prepare('SELECT user_id FROM bd_completion_notifications WHERE event_sent_at IS NULL AND lease_until<? LIMIT 5').bind(now).all()).results;
  for (const item of rows) {
    if (await completedCourseLessons(db, item.user_id) !== 6) continue;
    const row = await db.prepare('UPDATE bd_completion_notifications SET lease_until=? WHERE user_id=? AND event_sent_at IS NULL AND lease_until<? RETURNING payload').bind(now + 120000, item.user_id, now).first();
    if (!row) continue;
    try {
      const response = await fetch('https://api.omnisend.com/api/events', {
        method: 'POST',
        headers: {Authorization: `Omnisend-API-Key ${env.OMNISEND_API_KEY}`, 'Omnisend-Version': '2026-03-15', 'Content-Type': 'application/json'},
        body: row.payload,
        signal: AbortSignal.timeout(12000),
      });
      if (response.status !== 202) throw new Error('Completion event was not accepted.');
      await db.prepare('UPDATE bd_completion_notifications SET event_sent_at=CURRENT_TIMESTAMP,lease_until=0 WHERE user_id=?').bind(item.user_id).run();
    } catch {
      await db.prepare('UPDATE bd_completion_notifications SET lease_until=? WHERE user_id=?').bind(Date.now() + 60000, item.user_id).run();
      console.error(JSON.stringify({event: 'bibledecoded_completion_notification_pending'}));
    }
  }
}
