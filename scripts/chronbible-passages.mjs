import { readFileSync } from 'node:fs';
const chapters = JSON.parse(readFileSync(new URL('../assets/bible/kjv.json', import.meta.url))).chapters;
export const books = {};
for (const [name, verses] of Object.entries(chapters)) {
  const split = name.lastIndexOf(' '), book = name.slice(0, split), chapter = Number(name.slice(split + 1));
  (books[book] ??= {})[chapter] = verses.length;
}
const aliases = { ...Object.fromEntries(Object.keys(books).map(b => [b, b])), Psalm: 'Psalms' };
const names = Object.keys(aliases).sort((a,b) => b.length-a.length);
export function expand(reference) {
  let book;
  const result = [];
  for (let part of reference.replaceAll('–','-').split(';')) {
    part = part.trim();
    const name = names.find(n => part === n || part.startsWith(n+' '));
    if (name) { book = aliases[name]; part = part.slice(name.length).trim(); }
    if (!books[book]) throw new Error(`Unknown book: ${reference}`);
    if (!part) part = `1-${Object.keys(books[book]).length}`;
    for (const token of part.split(',')) {
      const match = token.trim().match(/^(\d+)(?::(\d+))?(?:-(\d+)(?::(\d+))?)?$/);
      if (!match) throw new Error(`Invalid passage: ${reference}`);
      const [a,b,c,d] = match.slice(1).map(x => x ? Number(x) : null);
      const endChapter = c === null || (b !== null && d === null) ? a : c;
      const endVerse = c === null ? b ?? books[book][a] : d ?? (b !== null ? c : books[book][c]);
      if (a > endChapter) throw new Error(`Reversed passage: ${reference}`);
      for (let ch=a;ch<=endChapter;ch++) {
        const lo=ch===a ? b??1 : 1, hi=ch===endChapter ? endVerse : books[book][ch];
        if (!(lo>=1 && hi>=lo && hi<=books[book][ch])) throw new Error(`Invalid verse: ${reference}`);
        for(let v=lo;v<=hi;v++) result.push(`${book} ${ch}:${v}`);
      }
    }
  }
  return result;
}
export const allVerses = Object.entries(books).flatMap(([book, chapters]) => Object.entries(chapters).flatMap(([ch,n]) => Array.from({length:n},(_,v)=>`${book} ${ch}:${v+1}`)));
