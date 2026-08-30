import { readFile, writeFile } from "node:fs/promises";
import { createBibleChapterTasks } from "./bible-chapter-tasks.mjs";

const websitePlanUrl = new URL("../chronbible/data/readings.json", import.meta.url);
const appPlanUrl = new URL("../../tryjesusjourney/data/chronologicalBiblePlan.json", import.meta.url);

const subdivisions = new Map(Object.entries({
  2: [
    ["Creation, the Fall, and the Promise", "Genesis 1-3"],
    ["Cain, Seth, and the Generations Before Noah", "Genesis 4-5"],
    ["The Flood and God's Covenant", "Genesis 6-9"],
    ["The Nations and the Tower of Babel", "Genesis 10-11"],
  ],
  3: [
    ["Abraham's Call and Covenant", "Genesis 12-17"],
    ["Promise, Judgment, and Abraham's Test", "Genesis 18-23"],
    ["Isaac and the Covenant Family", "Genesis 24-26"],
    ["Jacob's Deception, Exile, and Family", "Genesis 27-31"],
    ["Jacob Returns to Canaan", "Genesis 32-36"],
    ["Joseph's Suffering and Exaltation", "Genesis 37-41"],
    ["Joseph and His Brothers Reconciled", "Genesis 42-46"],
    ["Israel in Egypt and Jacob's Final Blessings", "Genesis 47-50"],
  ],
  4: [
    ["Israel's Bondage and Moses' Call", "Exodus 1-6"],
    ["The Plagues of Egypt", "Exodus 7-11"],
    ["Passover, Exodus, and the Red Sea", "Exodus 12-15"],
    ["God Provides in the Wilderness", "Exodus 16-18"],
    ["Sinai, the Law, and the Covenant", "Exodus 19-24"],
    ["Instructions for the Tabernacle", "Exodus 25-31"],
    ["The Golden Calf and Covenant Renewal", "Exodus 32-34"],
    ["The Tabernacle Completed", "Exodus 35-40"],
  ],
  5: [
    ["Offerings and Sacrifices", "Leviticus 1-7"],
    ["The Priesthood Consecrated", "Leviticus 8-10"],
    ["Cleanliness and Purification", "Leviticus 11-15"],
    ["Atonement and the Sacredness of Blood", "Leviticus 16-17"],
    ["Holy Living", "Leviticus 18-20"],
    ["Holiness Among the Priests", "Leviticus 21-22"],
    ["Feasts, Sabbaths, and Jubilee", "Leviticus 23-25"],
    ["Covenant Blessings, Consequences, and Vows", "Leviticus 26-27"],
  ],
  6: [
    ["Census, Camp, and Levites", "Numbers 1-4"],
    ["Purity and Dedication", "Numbers 5-8"],
    ["Israel Departs from Sinai", "Numbers 9-12"],
    ["The Spies and Israel's Rebellion", "Numbers 13-14"],
    ["Wilderness Laws and Korah's Rebellion", "Numbers 15-19"],
    ["The New Generation Advances", "Numbers 20-21"],
    ["Balaam and Balak", "Numbers 22-24"],
    ["Judgment, the Second Census, and Joshua", "Numbers 25-27"],
    ["Offerings, Vows, and the Eastern Tribes", "Numbers 28-32"],
    ["Remembering the Wilderness Journey", "Numbers 33-36; Psalm 90"],
  ],
  7: [
    ["Moses Reviews Israel's Journey", "Deuteronomy 1-4"],
    ["The Covenant and the Call to Love God", "Deuteronomy 5-11"],
    ["Worship, Leadership, and Community", "Deuteronomy 12-18"],
    ["Justice and Covenant Life", "Deuteronomy 19-26"],
    ["Blessings, Curses, and Choosing Life", "Deuteronomy 27-30"],
    ["Moses' Final Words and Death", "Deuteronomy 31-34; Psalm 91"],
  ],
  8: [
    ["Entering the Promised Land", "Joshua 1-5"],
    ["Jericho, Ai, and Covenant Renewal", "Joshua 6-8"],
    ["The Conquest of Canaan", "Joshua 9-12"],
    ["Dividing the Land", "Joshua 13-19"],
    ["Cities of Refuge, Levites, and the Eastern Tribes", "Joshua 20-22"],
    ["Joshua's Farewell and Covenant Renewal", "Joshua 23-24"],
  ],
  9: [
    ["Israel's Failure and the First Judges", "Judges 1-3"],
    ["Deborah and Barak", "Judges 4-5"],
    ["Gideon", "Judges 6-8"],
    ["Abimelech, Jephthah, and the Later Judges", "Judges 9-12"],
    ["Samson", "Judges 13-16"],
    ["Micah and the Tribe of Dan", "Judges 17-18"],
    ["Israel's Moral Collapse and Civil War", "Judges 19-21"],
  ],
  11: [
    ["Samuel's Birth and Call", "1 Samuel 1-3"],
    ["The Ark and Israel's Restoration", "1 Samuel 4-7"],
    ["Saul Becomes King", "1 Samuel 8-12"],
    ["Saul's Disobedience and Rejection", "1 Samuel 13-15"],
    ["David Anointed and Goliath Defeated", "1 Samuel 16-17"],
    ["Saul Turns Against David", "1 Samuel 18-20"],
    ["Trusting God While Threatened", "Psalm 11; Psalm 59"],
  ],
  12: [
    ["David Becomes a Fugitive", "1 Samuel 21-24"],
    ["Refuge, Deliverance, and Justice", "Psalm 7; Psalm 27; Psalm 31; Psalm 34; Psalm 52"],
    ["Prayers from Danger and Exile", "Psalm 56; Psalm 120; Psalm 140-142"],
  ],
  14: [
    ["Saul's Final Defeat", "1 Samuel 28-31"],
    ["Deliverance and Dependence", "Psalm 18; Psalm 121; Psalm 123-125"],
    ["Blessing, Repentance, and Hope", "Psalm 128-130"],
  ],
  15: [
    ["David Mourns Saul and Rises in Judah", "2 Samuel 1-4"],
    ["Human Frailty and God's Justice", "Psalm 6; Psalm 8-10; Psalm 14"],
    ["Confidence in God and His King", "Psalm 16; Psalm 19; Psalm 21"],
  ],
  21: [
    ["David, Jerusalem, and the Ark", "2 Samuel 5:11-25; 2 Samuel 6:1-23; 1 Chronicles 13-16"],
    ["God's King and His Holy Presence", "Psalm 1-2; Psalm 15; Psalm 22-24"],
    ["The Lord Reigns", "Psalm 47; Psalm 68; Psalm 89; Psalm 96"],
    ["Worship, Covenant, and Remembrance", "Psalm 100; Psalm 101; Psalm 105; Psalm 132"],
  ],
  32: [
    ["David Prepares for the Temple", "1 Chronicles 26-29"],
    ["God Builds, Provides, and Redeems", "Psalm 127; Psalm 111-114"],
    ["Praise and Thanksgiving", "Psalm 115-118"],
  ],
  36: [
    ["The Call to Wisdom", "Proverbs 1-4"],
    ["Warnings Against Sexual Sin", "Proverbs 5-7"],
    ["Wisdom's Invitation", "Proverbs 8-9"],
    ["Wisdom for Words, Work, and Character", "Proverbs 10-15"],
    ["Godly Conduct and Relationships", "Proverbs 16-22"],
    ["Sayings of the Wise", "Proverbs 23-24"],
  ],
  43: [
    ["Searching for Meaning", "Ecclesiastes 1-4"],
    ["Worship, Wealth, and Wisdom", "Ecclesiastes 5-8"],
    ["Living Wisely and Remembering God", "Ecclesiastes 9-12"],
  ],
  49: [
    ["Elijah and the Contest on Mount Carmel", "1 Kings 17-19"],
    ["Ahab's Wars and Death", "1 Kings 20-22"],
    ["Jehoshaphat", "2 Chronicles 18-20"],
    ["Judah's Decline and Joash's Preservation", "2 Chronicles 21-23"],
  ],
  51: [
    ["Elijah's Departure and Elisha's Early Ministry", "2 Kings 1-4"],
    ["Elisha, Naaman, and the Syrian Crisis", "2 Kings 5-8"],
    ["Jehu's Revolution", "2 Kings 9-10"],
    ["Joash and the Continuing Conflict", "2 Kings 11-13; 2 Chronicles 24"],
  ],
  60: [
    ["Oracles Against Babylon, Philistia, and Moab", "Isaiah 13-16"],
    ["Damascus, Israel, Egypt, and Cush", "Isaiah 17-20"],
    ["Babylon, Jerusalem, and Tyre", "Isaiah 21-23"],
    ["Worldwide Judgment and Restoration", "Isaiah 24-27"],
  ],
  62: [
    ["Hosea's Marriage and God's Faithful Love", "Hosea 1-3"],
    ["God's Case Against Israel", "Hosea 4-7"],
    ["Israel Reaps Its Rebellion", "Hosea 8-10"],
    ["God's Love and the Call to Return", "Hosea 11-14"],
  ],
  63: [
    ["Warnings Against Pride and Trusting Egypt", "Isaiah 28-31"],
    ["Judgment and the Coming Kingdom", "Isaiah 32-35"],
    ["Hezekiah, Assyria, and Deliverance", "Isaiah 36-39; Psalm 76"],
  ],
  66: [
    ["The Servant and the Restoration of Zion", "Isaiah 49-52"],
    ["The Suffering Servant and God's Invitation", "Isaiah 53-55"],
    ["True Worship, Sin, and Redemption", "Isaiah 56-59"],
    ["Zion's Glory and the Anointed One", "Isaiah 60-62"],
    ["Judgment, Prayer, and the New Creation", "Isaiah 63-66"],
  ],
  71: [
    ["Jeremiah's Call and Early Warnings", "Jeremiah 1-6"],
    ["The Temple Message and Judah's Idolatry", "Jeremiah 7-10"],
    ["The Broken Covenant and Jeremiah's Laments", "Jeremiah 11-15"],
    ["Signs, Opposition, and Persecution", "Jeremiah 16-20"],
    ["Kings, Shepherds, and Coming Judgment", "Jeremiah 21-25"],
    ["False Prophets and the Message to the Exiles", "Jeremiah 26-29"],
    ["Restoration and the New Covenant", "Jeremiah 30-33"],
    ["Judah's Last Opportunities to Repent", "Jeremiah 34-36"],
    ["Jerusalem Falls", "Jeremiah 37-40"],
    ["Lament Over Jerusalem's Destruction", "Psalm 74; Psalm 79"],
  ],
  74: [
    ["The Remnant Flees to Egypt", "Jeremiah 41-45"],
    ["Judgment Against the Nations", "Jeremiah 46-49"],
    ["Babylon's Fall and Jerusalem Remembered", "Jeremiah 50-52"],
  ],
  76: [
    ["Ezekiel's Vision and Call", "Ezekiel 1-3"],
    ["Signs of Jerusalem's Judgment", "Ezekiel 4-7"],
    ["Corruption in the Temple and God's Glory Departs", "Ezekiel 8-11"],
    ["Exile, False Prophets, and Personal Responsibility", "Ezekiel 12-14"],
    ["Allegories and Laments for Jerusalem", "Ezekiel 15-19"],
    ["Israel's Rebellion and Jerusalem's Siege", "Ezekiel 20-24"],
    ["Judgment Against the Surrounding Nations", "Ezekiel 25-28"],
    ["Judgment Against Egypt", "Ezekiel 29-32"],
    ["The Watchman, Shepherd, and Restoration", "Ezekiel 33-36"],
    ["Dry Bones and the Final Enemy", "Ezekiel 37-39"],
    ["The Temple Vision", "Ezekiel 40-43"],
    ["Worship, the Land, the River, and the City", "Ezekiel 44-48"],
  ],
  78: [
    ["Faithfulness in Babylon", "Daniel 1-3"],
    ["Proud Kings and God's Deliverance", "Daniel 4-6"],
    ["Kingdom Visions and Daniel's Prayer", "Daniel 7-9"],
    ["Daniel's Final Vision", "Daniel 10-12"],
  ],
  79: [
    ["Return, Altar, and Temple Foundation", "Ezra 1-3"],
    ["Opposition and Temple Completion", "Ezra 4-6"],
    ["Ezra's Ministry and Reform", "Ezra 7-10"],
    ["Remembering Exile", "Psalm 137"],
  ],
  81: [
    ["The Opening Visions and Joshua the High Priest", "Zechariah 1-3"],
    ["Visions of Restoration", "Zechariah 4-6"],
    ["From Fasting to Joy", "Zechariah 7-8"],
    ["The Coming King and Rejected Shepherd", "Zechariah 9-11"],
    ["Jerusalem and the Day of the Lord", "Zechariah 12-14"],
  ],
  83: [
    ["Nehemiah's Call and Return", "Nehemiah 1-2"],
    ["Rebuilding Under Opposition", "Nehemiah 3-4"],
    ["Reform and Completion of the Wall", "Nehemiah 5-7"],
    ["Scripture, Confession, and Covenant", "Nehemiah 8-10"],
    ["Dedication and Final Reforms", "Nehemiah 11-13"],
    ["A Song of Restoration", "Psalm 126"],
  ],
  123: [
    ["Ascension and Pentecost", "Acts 1-2"],
    ["The Church's Witness and Opposition", "Acts 3-5"],
    ["The Seven and Stephen", "Acts 6-7"],
    ["The Gospel Expands and Saul Is Converted", "Acts 8-9"],
    ["Gentiles Receive the Gospel", "Acts 10-12"],
    ["The First Missionary Journey", "Acts 13-14"],
  ],
  131: [
    ["Divisions and Servant Leadership", "1 Corinthians 1-4"],
    ["Discipline, Purity, and Marriage", "1 Corinthians 5-7"],
    ["Christian Liberty and Idolatry", "1 Corinthians 8-10"],
    ["Worship, Spiritual Gifts, and Love", "1 Corinthians 11-14"],
    ["Resurrection and Final Instructions", "1 Corinthians 15-16"],
  ],
  132: [
    ["Comfort and Forgiveness", "2 Corinthians 1-2"],
    ["The New Covenant and Reconciliation", "2 Corinthians 3-5"],
    ["Holiness and Godly Repentance", "2 Corinthians 6-7"],
    ["Generous Giving", "2 Corinthians 8-9"],
    ["Paul Defends His Ministry", "2 Corinthians 10-13"],
  ],
  134: [
    ["Humanity's Sin and God's Righteousness", "Romans 1-3"],
    ["Justification by Faith", "Romans 4-5"],
    ["New Life in Christ and the Spirit", "Romans 6-8"],
    ["Israel and God's Purposes", "Romans 9-11"],
    ["Transformed Christian Living", "Romans 12-13"],
    ["Unity, Mission, and Final Greetings", "Romans 14-16"],
  ],
  143: [
    ["The Supremacy of Christ", "Hebrews 1-2"],
    ["Faithfulness and God's Rest", "Hebrews 3-4"],
    ["Christ Our High Priest", "Hebrews 5-7"],
    ["The New Covenant and Perfect Sacrifice", "Hebrews 8-10"],
    ["Faith, Endurance, and Christian Community", "Hebrews 11-13"],
  ],
  150: [
    ["The Revelation of Jesus Christ", "Revelation 1"],
    ["The Seven Churches", "Revelation 2-3"],
    ["The Throne, the Lamb, and the Scroll", "Revelation 4-5"],
    ["The Seals", "Revelation 6-7"],
    ["The Trumpets and Two Witnesses", "Revelation 8-11"],
    ["The Dragon, the Beasts, and the Lamb", "Revelation 12-14"],
    ["The Seven Bowls", "Revelation 15-16"],
    ["Babylon's Fall", "Revelation 17-18"],
    ["Christ's Victory and Final Judgment", "Revelation 19-20"],
    ["New Jerusalem and Eternal Restoration", "Revelation 21-22"],
  ],
}));

function normalizeTasks(reference) {
  return createBibleChapterTasks(reference).map((task) => {
    const chapterReference = `${task.book === "Psalms" ? "Psalm" : task.book} ${task.chapter}`;
    return {
      label: chapterReference,
      url: `https://www.biblegateway.com/passage/?search=${encodeURIComponent(chapterReference)}&version=KJV`,
    };
  });
}

function taskKey(task) {
  const url = new URL(task.url);
  return url.searchParams.get("search").replace(/^Psalms /, "Psalm ");
}

const currentPlan = JSON.parse(await readFile(websitePlanUrl, "utf8"));
const originals = currentPlan.readingCount === 150
  ? currentPlan.readings
  : Array.from(Map.groupBy(currentPlan.readings, (reading) => reading.sourceNumber).entries()).map(([sourceNumber, readings]) => ({
      number: Number(sourceNumber),
      section: readings[0].section,
      reference: readings[0].sourceReference,
      bibleTasks: readings.flatMap((reading) => reading.bibleTasks),
      reviewNote: readings.find((reading) => reading.reviewNote)?.reviewNote ?? null,
    })).sort((left, right) => left.number - right.number);

if (originals.length !== 150) throw new Error(`Expected 150 original assignments, found ${originals.length}`);

const readings = [];
const legacyMigration = {};
const taskChapterMigration = {};
let chapterCount = 0;

for (const original of originals) {
  const parts = subdivisions.get(String(original.number)) ?? [[original.reference, original.reference]];
  const start = readings.length;
  const generatedTasks = [];

  for (const [partIndex, [title, reference]] of parts.entries()) {
    const baseTasks = parts.length === 1 ? original.bibleTasks : normalizeTasks(reference);
    const bibleTasks = baseTasks.map((task) => ({ label: task.label, url: task.url, progressIndex: chapterCount++ }));
    generatedTasks.push(...bibleTasks);
    const readingIndex = readings.length;
    readings.push({
      id: `chron-${String(original.number).padStart(3, "0")}-${String(partIndex + 1).padStart(2, "0")}`,
      index: readings.length,
      number: readings.length + 1,
      section: original.section,
      title,
      reference,
      sourceNumber: original.number,
      sourceReference: original.reference,
      partNumber: partIndex + 1,
      partCount: parts.length,
      bibleTasks,
      reviewNote: original.reviewNote ?? null,
    });
    taskChapterMigration[String(readingIndex)] = bibleTasks.map((task) => task.progressIndex);
  }

  if (parts.length > 1) {
    const expected = original.bibleTasks.map(taskKey);
    const actual = generatedTasks.map(taskKey);
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      throw new Error(`Subdivision ${original.number} changed chapter order.\nExpected: ${expected.join("; ")}\nActual: ${actual.join("; ")}`);
    }
  }

  legacyMigration[String(original.number - 1)] = Array.from({ length: readings.length - start }, (_, index) => start + index);
}

const sections = currentPlan.sections.map((section) => ({
  ...section,
  readingCount: readings.filter((reading) => reading.section === section.title).length,
}));

const reviewQueue = (currentPlan.reviewQueue ?? []).map((item) => ({
  ...item,
  sourceNumber: item.sourceNumber ?? originals.find((reading) => reading.reference === item.reference)?.number ?? null,
}));

const plan = {
  planId: "chronological-bible-order-v3",
  legacyPlanId: "chronological-bible-order-v2",
  originalLegacyPlanId: "chronological-bible-order-v1",
  title: "The Bible in Chronological Order",
  description: "Follow the biblical story in historical sequence through manageable, named reading tasks of no more than ten chapters.",
  source: "Try Jesus chronological Bible plan",
  originalReadingCount: 150,
  readingCount: readings.length,
  chapterCount,
  sectionCount: sections.length,
  sections,
  reviewQueue,
  legacyMigration,
  taskChapterMigration,
  readings,
};

if (readings.length !== 309) throw new Error(`Expected 309 reading tasks, generated ${readings.length}`);
if (readings.some((reading) => reading.bibleTasks.length < 1 || reading.bibleTasks.length > 10)) throw new Error("Every reading task must contain 1-10 Bible chapters");
if (chapterCount !== readings.reduce((total, reading) => total + reading.bibleTasks.length, 0)) throw new Error("Every chapter task must have one progress index");

const serialized = `${JSON.stringify(plan, null, 2)}\n`;
await writeFile(websitePlanUrl, serialized);
await writeFile(appPlanUrl, serialized);
console.log(`Generated ${readings.length} chronological reading tasks with ${chapterCount} individually trackable chapters across ${sections.length} historical sections.`);
