from pathlib import Path
from datetime import datetime, timezone
import json
import re

PLAN_PATH = Path("bibleandconflictoftheages/data/readings.json")
IMPORTER_PATH = Path("scripts/import-conflict-reading-plans.mjs")
APP_PATH = Path("bibleandconflictoftheages/app.js")


def update_plan() -> None:
    plan = json.loads(PLAN_PATH.read_text())
    readings = plan["readings"]

    if any(item.get("id") == "coa-002" for item in readings):
        first, second = readings[0], readings[1]
        assert (first["id"], first["sourceKey"]) == ("coa-001", "PP:1")
        assert (second["id"], second["sourceKey"]) == ("coa-002", "PP:2")

        combined = {
            **first,
            "day": 1,
            "sourceBlock": 1,
            "sourceKey": "PP:1+2",
            "sourceEntry": "Gen 1; 2\nCh 1—Why was Sin Permitted? PP 33-43\nCh 2—The Creation PP 44-51",
            "originalSourceEntry": f"{first['sourceEntry']}\n\n{second['sourceEntry']}",
            "correctionApplied": True,
            "heading": "",
            "title": "Why was Sin Permitted? · The Creation",
            "bibleReference": "Gen 1; 2",
            "bibleQuery": "Gen 1; 2",
            "bibleUrl": second["bibleUrl"],
            "bibleTasks": [
                {**task, "legacyProgressIndex": index}
                for index, task in enumerate(second["bibleTasks"], start=1)
            ],
            "commentaryCitation": "Ch 1—Why was Sin Permitted? PP 33-43 · Ch 2—The Creation PP 44-51",
            "commentaryPageStart": 33,
            "commentaryPageEnd": 51,
            "commentaryUrl": first["commentaryUrl"],
            "commentaryTasks": [
                {**first["commentaryTasks"][0], "legacyProgressIndex": 0},
                {**second["commentaryTasks"][0], "legacyProgressIndex": 3},
            ],
            "reviewNote": None,
        }
        readings = [combined, *readings[2:]]
    else:
        assert readings[0]["id"] == "coa-001"
        assert readings[0]["sourceKey"] == "PP:1+2"

    for day, reading in enumerate(readings, start=1):
        reading["day"] = day

    plan["readings"] = readings
    plan["readingAliases"] = {**plan.get("readingAliases", {}), "coa-002": "coa-001"}
    for book in plan["books"]:
        book["readingCount"] = sum(reading["code"] == book["code"] for reading in readings)
    plan["reviewQueue"] = [
        {key: reading[key] for key in ("id", "day", "sourceKey", "sourceEntry", "reviewNote")}
        for reading in readings
        if reading.get("reviewNote")
    ]
    plan["generatedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    PLAN_PATH.write_text(json.dumps(plan, indent=2, ensure_ascii=False) + "\n")


def update_importer() -> None:
    source = IMPORTER_PATH.read_text()
    old = '''const rawReadings = [
  ...parsePP(sourceTexts.PP),
  ...parsePK(sourceTexts.PK),
  ...parseDA(sourceTexts.DA),
  ...parseAA(sourceTexts.AA),
  ...parseGC(sourceTexts.GC),
];

const readings = rawReadings.map((reading, index) => ({
  id: `coa-${String(index + 1).padStart(3, "0")}`,
  day: index + 1,
  ...reading,
}));'''
    new = '''const parsedReadings = [
  ...parsePP(sourceTexts.PP),
  ...parsePK(sourceTexts.PK),
  ...parseDA(sourceTexts.DA),
  ...parseAA(sourceTexts.AA),
  ...parseGC(sourceTexts.GC),
].map((reading, index) => ({
  id: `coa-${String(index + 1).padStart(3, "0")}`,
  ...reading,
}));

function combineOpeningPpReadings(items) {
  const [first, second, ...remaining] = items;
  if (first?.sourceKey !== "PP:1" || second?.sourceKey !== "PP:2") {
    throw new Error("The first two Patriarchs and Prophets assignments could not be identified.");
  }
  return [
    {
      ...first,
      sourceBlock: 1,
      sourceKey: "PP:1+2",
      sourceEntry: "Gen 1; 2\\nCh 1—Why was Sin Permitted? PP 33-43\\nCh 2—The Creation PP 44-51",
      originalSourceEntry: `${first.sourceEntry}\\n\\n${second.sourceEntry}`,
      correctionApplied: true,
      heading: "",
      title: "Why was Sin Permitted? · The Creation",
      bibleReference: "Gen 1; 2",
      bibleQuery: "Gen 1; 2",
      bibleUrl: second.bibleUrl,
      bibleTasks: second.bibleTasks.map((task, index) => ({ ...task, legacyProgressIndex: index + 1 })),
      commentaryCitation: "Ch 1—Why was Sin Permitted? PP 33-43 · Ch 2—The Creation PP 44-51",
      commentaryPageStart: 33,
      commentaryPageEnd: 51,
      commentaryUrl: first.commentaryUrl,
      commentaryTasks: [
        { ...first.commentaryTasks[0], legacyProgressIndex: 0 },
        { ...second.commentaryTasks[0], legacyProgressIndex: 3 },
      ],
      reviewNote: null,
    },
    ...remaining,
  ];
}

const rawReadings = combineOpeningPpReadings(parsedReadings);
const readings = rawReadings.map((reading, index) => ({
  day: index + 1,
  ...reading,
}));'''

    if "function combineOpeningPpReadings" not in source:
        if old not in source:
            raise RuntimeError("Expected importer assembly block was not found")
        source = source.replace(old, new, 1)

    hash_line = '  sourceHashes: Object.fromEntries(Object.entries(sourceTexts).map(([code, text]) => [code, createHash("sha256").update(text).digest("hex")])),\n'
    alias_line = '  readingAliases: { "coa-002": "coa-001" },\n'
    if alias_line not in source:
        if hash_line not in source:
            raise RuntimeError("Expected sourceHashes line was not found")
        source = source.replace(hash_line, hash_line + alias_line, 1)

    IMPORTER_PATH.write_text(source)


def update_app() -> None:
    source = APP_PATH.read_text()
    source = source.replace(
        "    getReadings: () => plan?.readings || [],",
        "    getReadings: () => readingsWithAliases(),",
        1,
    )
    source = source.replace(
        "      const index = plan.readings.findIndex((reading) => reading.id === readingId);",
        "      const index = plan.readings.findIndex((reading) => reading.id === resolveReadingId(readingId));",
        1,
    )

    if "function resolveReadingId(readingId)" not in source:
        anchor = '  function escapeHTML(value = "") {'
        helpers = '''  function resolveReadingId(readingId) {
    return plan?.readingAliases?.[readingId] || readingId;
  }

  function readingIdsFor(readingId) {
    return [
      readingId,
      ...Object.entries(plan?.readingAliases || {})
        .filter(([, targetId]) => targetId === readingId)
        .map(([aliasId]) => aliasId),
    ];
  }

  function readingsWithAliases() {
    const readings = plan?.readings || [];
    const aliases = Object.entries(plan?.readingAliases || {}).map(([aliasId, targetId]) => {
      const target = readings.find((reading) => reading.id === targetId);
      return target ? { ...target, id: aliasId, aliasOf: targetId } : null;
    }).filter(Boolean);
    return [...readings, ...aliases];
  }

  function escapeHTML(value = "") {'''
        if anchor not in source:
            raise RuntimeError("Expected escapeHTML anchor was not found")
        source = source.replace(anchor, helpers, 1)

    if "const reserved = new Set(tasks" not in source:
        pattern = re.compile(
            r"  function prepareChapterProgressIndex\(\) \{.*?\n  \}\n\n  function taskGroupComplete",
            re.DOTALL,
        )
        replacement = '''  function prepareChapterProgressIndex() {
    const tasks = plan.readings.flatMap((reading) => [
      ...(reading.bibleTasks ?? []),
      ...(reading.commentaryTasks ?? []),
    ]);
    const reserved = new Set(tasks
      .map((task) => task.legacyProgressIndex)
      .filter((index) => Number.isInteger(index) && index >= 0));
    let nextIndex = 0;
    let maximumIndex = -1;

    for (const task of tasks) {
      if (Number.isInteger(task.legacyProgressIndex) && task.legacyProgressIndex >= 0) {
        task.progressIndex = task.legacyProgressIndex;
      } else {
        while (reserved.has(nextIndex)) nextIndex += 1;
        task.progressIndex = nextIndex;
        nextIndex += 1;
      }
      maximumIndex = Math.max(maximumIndex, task.progressIndex);
    }
    chapterTaskCount = maximumIndex + 1;
  }

  function taskGroupComplete'''
        source, count = pattern.subn(replacement, source, count=1)
        if count != 1:
            raise RuntimeError("Chapter progress function replacement failed")

    source = source.replace(
        "      const last = plan.readings.findIndex((reading) => reading.id === settings.last_reading_id);",
        "      const last = plan.readings.findIndex((reading) => reading.id === resolveReadingId(settings.last_reading_id));",
        1,
    )
    source = source.replace(
        "    const readingPrinciples = principles.filter((principle) => principle.reading_id === reading.id);",
        "    const readingIds = new Set(readingIdsFor(reading.id));\n    const readingPrinciples = principles.filter((principle) => readingIds.has(principle.reading_id));",
        1,
    )
    APP_PATH.write_text(source)


update_plan()
update_importer()
update_app()
