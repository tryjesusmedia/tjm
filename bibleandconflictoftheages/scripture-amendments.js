/* Owner-approved website amendments, 2026-11-25. The original plan and its
   progress-bearing assignment order also serve the native app. Keep new
   passages outside bibleTasks so neither saved indexes nor old links shift. */
(() => {
  const additions = {
    'coa-170': [['luke-9-37-45', 'Luke 9:37-45', 1]],
    'coa-188': [
      ['mark-11-27-33', 'Mark 11:27-33', 1],
      ['luke-19-45-48', 'Luke 19:45-48', 2],
    ],
  };

  window.TJM_applyConflictScriptureAmendments = function (plan) {
    for (const reading of plan.readings) {
      if (reading.id === 'coa-185') {
        const task = reading.bibleTasks?.[4];
        if (task?.reference === 'John 12:1-8') {
          const previous = task.reference;
          task.reference = 'John 12:1-11';
          task.label = 'Read ' + task.reference;
          task.url = 'https://www.biblegateway.com/passage/?search=John%2012%3A1-11&version=KJV';
          reading.bibleReference = reading.bibleReference.replace(previous, task.reference);
        }
      }
      if (!Object.hasOwn(additions, reading.id)) continue;
      reading.supplementalBibleTasks = additions[reading.id].map(([key, reference, afterIndex]) => ({
        key, reference, label: 'Read ' + reference, afterIndex,
      }));
      reading.bibleReference = reading.bibleTasks.flatMap((task, index) => [
        task.reference,
        ...reading.supplementalBibleTasks.filter(extra => extra.afterIndex === index).map(extra => extra.reference),
      ]).join('; ');
    }
    return plan;
  };
})();
