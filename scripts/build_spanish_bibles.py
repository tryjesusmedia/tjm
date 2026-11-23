#!/usr/bin/env python3
"""Vendor pinned public-domain Spanish Scripture editions from eBible.org USFX.

No third-party API is used by the live ChronBible reader. The build checks that all
66 canonical books, 1189 chapters and all planned Scripture chapter references exist.
Re-run intentionally only to update the pinned official editions.
"""
from __future__ import annotations

import hashlib
import io
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "es/chronbible/read/text"
PLAN = ROOT / "es/chronbible/data/readings.json"
SOURCE = {
    "bes": ("spabes_usfx.zip", "La Biblia en Español Sencillo 2026", "https://ebible.org/find/details.php?id=spabes"),
    "rv1909": ("spaRV1909_usfx.zip", "Reina-Valera 1909", "https://ebible.org/find/details.php?id=spaRV1909"),
}
# USFM -> OSIS codes matching /chronbible/read/text, in canonical order.
PAIR = """GEN Gen
EXO Exod
LEV Lev
NUM Num
DEU Deut
JOS Josh
JDG Judg
RUT Ruth
1SA 1Sam
2SA 2Sam
1KI 1Kgs
2KI 2Kgs
1CH 1Chr
2CH 2Chr
EZR Ezra
NEH Neh
EST Esth
JOB Job
PSA Ps
PRO Prov
ECC Eccl
SNG Song
ISA Isa
JER Jer
LAM Lam
EZK Ezek
DAN Dan
HOS Hos
JOL Joel
AMO Amos
OBA Obad
JON Jonah
MIC Mic
NAM Nah
HAB Hab
ZEP Zeph
HAG Hag
ZEC Zech
MAL Mal
MAT Matt
MRK Mark
LUK Luke
JHN John
ACT Acts
ROM Rom
1CO 1Cor
2CO 2Cor
GAL Gal
EPH Eph
PHP Phil
COL Col
1TH 1Thess
2TH 2Thess
1TI 1Tim
2TI 2Tim
TIT Titus
PHM Phlm
HEB Heb
JAS Jas
1PE 1Pet
2PE 2Pet
1JN 1John
2JN 2John
3JN 3John
JUD Jude
REV Rev"""
CODE = dict(line.split() for line in PAIR.splitlines())
EXPECTED_CHAPTERS = [50,40,27,36,34,24,21,4,31,24,22,25,29,36,10,13,10,42,150,31,12,8,66,52,5,48,12,14,3,9,1,4,7,3,3,3,2,14,4,28,16,24,21,28,16,16,13,6,6,4,4,5,3,6,4,3,1,13,5,5,3,5,1,1,1,22]
assert len(CODE) == len(EXPECTED_CHAPTERS) == 66

SKIP_TAGS = frozenset({
    "id","h","toc","toca","mt","mte","ms","s","sr","r","cl","d",
    "f","fe","ef","x","ex","fig","rem","ide","periph","ca","cp","va","vp",
    "generated","milestone","sectionBoundary","ref","rq","ior","ndx"
})

def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()

def fetch_zip(filename: str) -> tuple[ET.Element, str]:
    url = "https://ebible.org/Scriptures/" + filename
    request = urllib.request.Request(url, headers={"User-Agent": "ChronBible/1.0 (public-domain-ebook-bundling)"})
    with urllib.request.urlopen(request, timeout=120) as response:
        archive = response.read()
    digest = hashlib.sha256(archive).hexdigest()
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        candidates = [name for name in z.namelist()
                      if name.lower().endswith((".usfx", ".usfx.xml", ".xml")) and not name.startswith("__MACOSX/")]
        if not candidates:
            raise ValueError(f"No USFX XML file found in {filename}: {z.namelist()[:20]}")
        # Prefer the complete Bible XML, not supplementary metadata XML.
        for name in sorted(candidates, key=lambda n: -z.getinfo(n).file_size):
            content = z.read(name)
            try:
                root = ET.fromstring(content)
            except ET.ParseError:
                continue
            if root.tag.split("}")[-1].lower() == "usfx" and len(list(root.iter("book"))) >= 66:
                print(f"Source {filename}: {name}, {len(content):,} XML bytes, sha256={digest}")
                return root, digest
        raise ValueError(f"No complete 66-book USFX Bible in {filename}")

def scripture_book(elem: ET.Element, osis: str, version: str) -> dict:
    """Extract canonical verse bodies from USFX milestones without notes/headings.

    USFX <c id> and <v id> are milestones; Scripture text is normally in their
    tails or nested in p/q containers. Traverse in document order, preserving
    mixed text such as italic or divine-name inline elements.
    """
    current_chapter = None
    current_verse = None
    parts = defaultdict(list)  # (chapter, verse) -> [strings]

    def append(text: str | None):
        if text and current_chapter is not None and current_verse is not None:
            # Preserve exact inline XML text boundaries: inserting a space here
            # corrupts Spanish punctuation and words split by inline markup.
            parts[(current_chapter, current_verse)].append(text)

    def walk(node: ET.Element):
        nonlocal current_chapter, current_verse
        tag = node.tag.split("}")[-1]
        if tag == "c":
            raw = node.attrib.get("id", "").strip()
            match = re.match(r"^\d+", raw)
            if not match:
                raise ValueError(f"Invalid chapter milestone {osis}: {raw!r}")
            current_chapter = int(match.group())
            current_verse = None
            return
        if tag == "v":
            raw = node.attrib.get("id", "").strip()
            match = re.match(r"^\d+", raw)
            if not match:
                raise ValueError(f"Invalid verse milestone {osis} {current_chapter}: {raw!r}")
            current_verse = int(match.group())
            return
        if tag == "ve":
            current_verse = None
            return
        if tag in SKIP_TAGS:
            return
        append(node.text)
        for child in node:
            walk(child)
            append(child.tail)

    walk(elem)
    chapters = []
    number_of_chapters = EXPECTED_CHAPTERS[list(CODE.values()).index(osis)]
    for ch in range(1, number_of_chapters + 1):
        verses = [
            {"number": verse, "text": normalize("".join(texts))}
            for (chapter, verse), texts in sorted(parts.items())
            if chapter == ch and texts
        ]
        if not verses:
            raise ValueError(f"No text in {version} {osis} {ch}")
        if verses[0]["number"] != 1:
            raise ValueError(f"First verse missing: {version} {osis} {ch}")
        chapters.append({"chapter": ch, "verses": verses})
    return {"version": version, "book": osis, "chapters": chapters}

def make_edition(slug: str, filename: str, label: str, source_page: str):
    root, digest = fetch_zip(filename)
    by_usfm = {el.attrib.get("id", "").upper(): el for el in root.iter("book")}
    missing = set(CODE) - set(by_usfm)
    if missing:
        raise ValueError(f"{slug}: missing Bible books: {sorted(missing)}")
    target = OUT / slug
    target.mkdir(parents=True, exist_ok=True)
    count = 0
    verse_count = 0
    for usfm, osis in CODE.items():
        data = scripture_book(by_usfm[usfm], osis, slug)
        count += len(data["chapters"])
        verse_count += sum(len(ch["verses"]) for ch in data["chapters"])
        (target / (osis + ".json")).write_text(
            json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8"
        )
    if count != 1189 or verse_count < 30000:
        raise ValueError(f"{slug}: incomplete edition: {count} chapters and {verse_count} verses")
    print(f"{slug}: verified {len(CODE)} books, {count} chapters, {verse_count} numbered verses")
    return {"id": slug, "title": label, "books": 66, "chapters": count,
            "numberedVerses": verse_count, "upstream": source_page,
            "zip": "https://ebible.org/Scriptures/" + filename, "zipSha256": digest,
            "license": "Public Domain (as marked by eBible.org in the 2026 edition)"}

def validate_plan(plan: dict):
    names = {
        "Génesis":"Gen","Éxodo":"Exod","Levítico":"Lev","Números":"Num",
        "Deuteronomio":"Deut","Josué":"Josh","Jueces":"Judg","Rut":"Ruth",
        "1 Samuel":"1Sam","2 Samuel":"2Sam","1 Reyes":"1Kgs","2 Reyes":"2Kgs",
        "1 Crónicas":"1Chr","2 Crónicas":"2Chr","Esdras":"Ezra","Nehemías":"Neh",
        "Ester":"Esth","Job":"Job","Salmo":"Ps","Proverbios":"Prov",
        "Eclesiastés":"Eccl","Cantar de los Cantares":"Song","Isaías":"Isa",
        "Jeremías":"Jer","Lamentaciones":"Lam","Ezequiel":"Ezek",
        "Daniel":"Dan","Oseas":"Hos","Joel":"Joel","Amós":"Amos",
        "Abdías":"Obad","Jonás":"Jonah","Miqueas":"Mic","Nahúm":"Nah",
        "Habacuc":"Hab","Sofonías":"Zeph","Hageo":"Hag","Zacarías":"Zech",
        "Malaquías":"Mal","Mateo":"Matt","Marcos":"Mark","Lucas":"Luke",
        "Juan":"John","Hechos":"Acts","Romanos":"Rom","1 Corintios":"1Cor",
        "2 Corintios":"2Cor","Gálatas":"Gal","Efesios":"Eph",
        "Filipenses":"Phil","Colosenses":"Col","1 Tesalonicenses":"1Thess",
        "2 Tesalonicenses":"2Thess","1 Timoteo":"1Tim","2 Timoteo":"2Tim",
        "Tito":"Titus","Filemón":"Phlm","Hebreos":"Heb","Santiago":"Jas",
        "1 Pedro":"1Pet","2 Pedro":"2Pet","1 Juan":"1John","2 Juan":"2John",
        "3 Juan":"3John","Judas":"Jude","Apocalipsis":"Rev"
    }
    tasks = [task["label"] for rd in plan["readings"] for task in rd["bibleTasks"]]
    assert len(plan["readings"]) == 313 and len(tasks) == 1440
    for edition in SOURCE:
        index = {}
        for code in CODE.values():
            entry = json.loads((OUT / edition / (code + ".json")).read_text(encoding="utf-8"))
            index[code] = entry["chapters"]
        missing = []
        for task in tasks:
            match = re.fullmatch(r"(.+?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?", task)
            if not match or match[1] not in names:
                missing.append(task); continue
            code, chapter = names[match[1]], int(match[2])
            if chapter > len(index[code]):
                missing.append(task); continue
            verses = {v["number"] for v in index[code][chapter - 1]["verses"]}
            if match[3]:
                start = int(match[3]); end = int(match[4] or match[3])
                if not any(start <= v <= end for v in verses):
                    missing.append(task)
        if missing:
            raise ValueError(f"{edition}: {len(missing)} unresolvable readings: {missing[:20]}")
        print(f"{edition}: ALL 1440 ChronBible passage assignments resolve")

def main():
    output = [make_edition(slug, *info) for slug, info in SOURCE.items()]
    validate_plan(json.loads(PLAN.read_text(encoding="utf-8")))
    (OUT / "manifest.json").write_text(json.dumps({
        "source": "Official eBible.org USFX exports; independently stored with the ChronBible website",
        "translations": output, "readingCount": 313, "passageCount": 1440
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("SUCCESS: Offline Spanish Scriptures ready for GitHub and Cloudflare")

if __name__ == "__main__":
    main()
