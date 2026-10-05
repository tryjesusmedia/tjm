/* Passage-aware migration. Old rows are retained; the document plan has its own ID. */
(function (root) {
  'use strict';
  function migrate(plan, row, version) {
    const old = plan.migration.legacy;
    let indices = (row.completed_indices ?? []).map(Number).filter(Number.isInteger);
    let last = Number(row.last_index) || 0;
    if (version === 'v3') {
      indices = indices.map(i => old.previousChapterMigration[i]).filter(Number.isInteger);
      last = old.previousReadingMigration[last] ?? 0;
    } else if (version === 'v2') {
      indices = indices.flatMap(i => old.taskChapterMigration[i] ?? []);
      last = old.taskReadingMigration[last] ?? 0;
    } else if (version === 'v1') {
      indices = indices.flatMap(i => old.originalChapterMigration[i] ?? []);
      last = old.originalReadingMigration[last]?.first ?? 0;
    }
    const done = new Set(indices);
    const completed = plan.migration.v4Requirements.flatMap((groups,i) => groups.length && groups.every(options => options.some(j => done.has(j))) ? [i] : []);
    return {completed, lastIndex: Math.max(0,plan.migration.v4ReadingMap[last] ?? 0)};
  }
  root.TJMPlanProgress = {migrate};
})(globalThis);
