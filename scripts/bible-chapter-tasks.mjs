const books = [
  ["Genesis", 50, ["Gen"]], ["Exodus", 40, ["Ex"]], ["Leviticus", 27, ["Lev"]], ["Numbers", 36, ["Num"]], ["Deuteronomy", 34, ["Deut", "Dt"]],
  ["Joshua", 24, ["Josh"]], ["Judges", 21, []], ["Ruth", 4, []], ["1 Samuel", 31, ["1 Sa", "1 Sam"]], ["2 Samuel", 24, ["2 Sa", "2 Sam"]],
  ["1 Kings", 22, ["1 Ki"]], ["2 Kings", 25, ["2 Ki"]], ["1 Chronicles", 29, ["1 Chron"]], ["2 Chronicles", 36, ["2 Chron"]],
  ["Ezra", 10, []], ["Nehemiah", 13, []], ["Esther", 10, []], ["Job", 42, []], ["Psalms", 150, ["Psalm", "Ps"]],
  ["Proverbs", 31, []], ["Ecclesiastes", 12, []], ["Song of Solomon", 8, []], ["Isaiah", 66, ["Is"]], ["Jeremiah", 52, ["Jer"]],
  ["Lamentations", 5, ["Lam"]], ["Ezekiel", 48, ["Eze"]], ["Daniel", 12, []], ["Hosea", 14, []], ["Joel", 3, []], ["Amos", 9, []],
  ["Obadiah", 1, []], ["Jonah", 4, []], ["Micah", 7, []], ["Nahum", 3, []], ["Habakkuk", 3, []], ["Zephaniah", 3, ["Zeph"]],
  ["Haggai", 2, []], ["Zechariah", 14, ["Zech"]], ["Malachi", 4, []], ["Matthew", 28, ["Mt"]], ["Mark", 16, ["Mk"]],
  ["Luke", 24, ["Lk"]], ["John", 21, ["Jn"]], ["Acts", 28, []], ["Romans", 16, []], ["1 Corinthians", 16, []], ["2 Corinthians", 13, []],
  ["Galatians", 6, []], ["Ephesians", 6, []], ["Philippians", 4, []], ["Colossians", 4, []], ["1 Thessalonians", 5, []], ["2 Thessalonians", 3, []],
  ["1 Timothy", 6, []], ["2 Timothy", 4, []], ["Titus", 3, []], ["Philemon", 1, []], ["Hebrews", 13, []], ["James", 5, []],
  ["1 Peter", 5, []], ["2 Peter", 3, []], ["1 John", 5, []], ["2 John", 1, []], ["3 John", 1, []], ["Jude", 1, []], ["Revelation", 22, []],
].map(([name, chapterCount, aliases]) => ({ name, chapterCount, aliases: [name, ...aliases] }));

const aliasLookup = new Map();
for (const book of books) for (const alias of book.aliases) aliasLookup.set(alias.toLowerCase().replace(/\s+/g, " "), book);
const aliasPattern = [...aliasLookup.keys()]
  .sort((left, right) => right.length - left.length)
  .map((alias) => alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"))
  .join("|");
const bookPattern = new RegExp(`\\b(${aliasPattern})\\b`, "gi");

function range(start, end) {
  const values = [];
  for (let value = start; value <= end; value += 1) values.push(value);
  return values;
}

function normalizedBook(match) {
  return aliasLookup.get(match.toLowerCase().replace(/\s+/g, " "));
}

export function createBibleChapterTasks(reference) {
  if (!reference) return [];
  const matches = [...reference.matchAll(bookPattern)];
  if (!matches.length) throw new Error(`No Bible book could be identified in: ${reference}`);
  const tasks = [];
  const taskByKey = new Map();

  function addTask(book, chapter, versePart = "") {
    if (!Number.isInteger(chapter) || chapter < 1 || chapter > book.chapterCount) {
      throw new Error(`Invalid ${book.name} chapter ${chapter} in: ${reference}`);
    }
    const key = `${book.name}:${chapter}`;
    let task = taskByKey.get(key);
    if (!task) {
      task = { book: book.name, chapter, fullChapter: false, verseParts: [] };
      taskByKey.set(key, task);
      tasks.push(task);
    }
    const verses = versePart.replace(/\s+/g, " ").replace(/^[:,;\s]+|[.;\s]+$/g, "");
    if (!verses) {
      task.fullChapter = true;
      task.verseParts = [];
    } else if (!task.fullChapter && !task.verseParts.includes(verses)) {
      task.verseParts.push(verses);
    }
  }

  for (let matchIndex = 0; matchIndex < matches.length; matchIndex += 1) {
    const match = matches[matchIndex];
    const book = normalizedBook(match[0]);
    const contentStart = match.index + match[0].length;
    const contentEnd = matches[matchIndex + 1]?.index ?? reference.length;
    const content = reference.slice(contentStart, contentEnd).replace(/^[\s,;]+|[\s,;]+$/g, "");
    if (!content) {
      for (const chapter of range(1, book.chapterCount)) addTask(book, chapter);
      continue;
    }

    let currentChapter = null;
    let previousHadVerses = false;
    for (const rawClause of content.split(";")) {
      const clause = rawClause.trim().replace(/\.$/, "");
      if (!clause) continue;

      const crossFromWhole = clause.match(/^(\d+)\s*-\s*(\d+)\s*:\s*(.+)$/);
      if (crossFromWhole) {
        const startChapter = Number(crossFromWhole[1]);
        const endChapter = Number(crossFromWhole[2]);
        for (const chapter of range(startChapter, endChapter - 1)) addTask(book, chapter);
        addTask(book, endChapter, `1-${crossFromWhole[3]}`);
        currentChapter = endChapter;
        previousHadVerses = true;
        continue;
      }

      const withVerses = clause.match(/^(\d+)\s*:\s*(.+)$/);
      if (withVerses) {
        const startChapter = Number(withVerses[1]);
        const verseExpression = withVerses[2];
        const crossChapter = verseExpression.match(/^(\d+)\s*-\s*(\d+)\s*:\s*(.+)$/);
        if (crossChapter) {
          const endChapter = Number(crossChapter[2]);
          addTask(book, startChapter);
          for (const chapter of range(startChapter + 1, endChapter - 1)) addTask(book, chapter);
          addTask(book, endChapter, `1-${crossChapter[3]}`);
          currentChapter = endChapter;
        } else {
          addTask(book, startChapter, verseExpression);
          currentChapter = startChapter;
        }
        previousHadVerses = true;
        continue;
      }

      const numericRange = clause.match(/^(\d+)\s*-\s*(\d+)$/);
      if (numericRange && previousHadVerses && currentChapter) {
        const first = Number(numericRange[1]);
        if (first <= currentChapter || first > currentChapter + 5) {
          addTask(book, currentChapter, `${numericRange[1]}-${numericRange[2]}`);
          continue;
        }
      }

      const chapterParts = clause.split(",").map((part) => part.trim()).filter(Boolean);
      for (const chapterPart of chapterParts) {
        const chapterRange = chapterPart.match(/^(\d+)\s*-\s*(\d+)$/);
        if (chapterRange) {
          for (const chapter of range(Number(chapterRange[1]), Number(chapterRange[2]))) addTask(book, chapter);
          currentChapter = Number(chapterRange[2]);
        } else if (/^\d+$/.test(chapterPart)) {
          currentChapter = Number(chapterPart);
          addTask(book, currentChapter);
        } else {
          throw new Error(`Could not split Bible chapters from "${clause}" in: ${reference}`);
        }
      }
      previousHadVerses = false;
    }
  }

  return tasks.map((task) => {
    const referenceText = task.fullChapter || !task.verseParts.length
      ? `${task.book} ${task.chapter}`
      : `${task.book} ${task.chapter}:${task.verseParts.join(", ")}`;
    return {
      label: `Read ${referenceText}`,
      reference: referenceText,
      book: task.book,
      chapter: task.chapter,
      url: `https://www.biblegateway.com/passage/?search=${encodeURIComponent(referenceText)}&version=KJV`,
    };
  });
}
