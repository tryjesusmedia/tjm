import { LESSON_QUIZZES } from '../../scripts/bd-quizzes.js';

// Completion is earned by a passing quiz, never by a client-supplied checkbox.
// Existing saved passing scores count; an earned pass survives later practice attempts.
export const passedQuizSQL = "((field_id='__quiz_passed' AND json_extract(value,'$')=1) OR (field_id='__quiz_score' AND CAST(json_extract(value,'$') AS INTEGER)>=90))";
export function gradeQuiz(lessonId, answers) {
  const questions = LESSON_QUIZZES[lessonId];
  if (!questions || !Array.isArray(answers) || answers.length !== questions.length ||
      !answers.every((answer, index) => Number.isInteger(answer) && answer >= 0 && answer < questions[index].choices.length)) return null;
  return Math.round(100 * answers.filter((answer, index) => answer === questions[index].answer).length / questions.length);
}
export async function quizCompleted(db, userId, lessonId) {
  return !!await db.prepare(`SELECT 1 FROM bd_answers WHERE user_id=? AND scope=? AND ${passedQuizSQL} LIMIT 1`).bind(userId, lessonId).first();
}
export async function completedCourseLessons(db, userId) {
  const row = await db.prepare(`SELECT count(DISTINCT scope) AS n FROM bd_answers WHERE user_id=? AND scope IN ('foundations','look-for-christ','pattern-recognition','questioning-method','exegesis','bible-memorization') AND ${passedQuizSQL}`).bind(userId).first();
  return row.n;
}
export async function quizProgress(db, userId) {
  const rows = (await db.prepare(`SELECT p.lesson_id,p.seconds,p.last_field,p.updated_at,
    (SELECT CAST(json_extract(value,'$') AS INTEGER) FROM bd_answers WHERE user_id=p.user_id AND scope=p.lesson_id AND field_id='__quiz_score') AS quiz_score,
    EXISTS(SELECT 1 FROM bd_answers WHERE user_id=p.user_id AND scope=p.lesson_id AND ${passedQuizSQL}) AS quiz_passed
    FROM bd_progress p WHERE p.user_id=?`).bind(userId).all()).results;
  return rows.map(row => ({...row, completed: row.quiz_passed}));
}
export function quizSaveStatements(db, userId, lessonId, score) {
  return [
    // Record a pass before replacing the latest score, including legacy saved passes.
    // INSERT OR IGNORE makes the earned flag monotonic even during concurrent retakes.
    db.prepare(`INSERT OR IGNORE INTO bd_answers(user_id,scope,field_id,value,revision)
      SELECT ?,?,'__quiz_passed','true',1 WHERE ?>=90 OR EXISTS(
        SELECT 1 FROM bd_answers WHERE user_id=? AND scope=? AND ${passedQuizSQL})`)
      .bind(userId, lessonId, score, userId, lessonId),
    db.prepare(`INSERT INTO bd_answers(user_id,scope,field_id,value,revision) VALUES (?,?,'__quiz_score',?,1)
      ON CONFLICT(user_id,scope,field_id) DO UPDATE SET value=excluded.value,revision=bd_answers.revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
      .bind(userId, lessonId, JSON.stringify(score)),
  ];
}
