import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";

import { columnIndex, decodeXml, readWorkbook, rowsToTsv } from "../src/lib/xlsx";

/** A minimal zip writer: enough to build a workbook the way Excel does. */
function zip(files: Record<string, string>, store = false): Uint8Array {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.from(content);
    const data = store ? raw : deflateRawSync(raw);
    const nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(store ? 0 : 8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    parts.push(local, nameBytes, data);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(store ? 0 : 8, 10);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, directory, end]));
}

const WORKBOOK = {
  "[Content_Types].xml": "<Types/>",
  "xl/workbook.xml":
    '<workbook xmlns:r="r"><sheets><sheet name="Current Roster" sheetId="1" r:id="rId1"/><sheet name="Pipeline &amp; Future" sheetId="2" r:id="rId2"/></sheets></workbook>',
  "xl/_rels/workbook.xml.rels":
    '<Relationships><Relationship Id="rId1" Type="ws" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="ws" Target="/xl/worksheets/sheet2.xml"/></Relationships>',
  "xl/sharedStrings.xml":
    '<sst><si><t>Store #</t></si><si><t>Site Name</t></si><si><r><t>Peter</t></r><r><t xml:space="preserve">&apos;s Creek</t></r></si><si><t>Charlie O&apos;Connell</t></si></sst>',
  "xl/worksheets/sheet1.xml":
    '<worksheet><sheetData>' +
    '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="inlineStr"><is><t>Operator</t></is></c></row>' +
    '<row r="2"><c r="A2"><v>3271.0</v></c><c r="B2" t="s"><v>2</v></c><c r="D2" t="s"><v>3</v></c><c r="E2" t="b"><v>1</v></c></row>' +
    '<row r="3"/>' +
    "</sheetData></worksheet>",
  "xl/worksheets/sheet2.xml": '<worksheet><sheetData><row r="1"><c r="A1"><v>3090</v></c></row></sheetData></worksheet>',
};

test("reads every sheet of a workbook, by name, with cells in their columns", async () => {
  const sheets = await readWorkbook(zip(WORKBOOK));
  assert.deepEqual(
    sheets.map((s) => s.name),
    ["Current Roster", "Pipeline & Future"],
  );
  assert.deepEqual(sheets[0].rows, [
    ["Store #", "Site Name", "", "Operator"],
    // A store number Excel saved as 3271.0 comes out as 3271; rich text runs
    // join; an empty column stays empty rather than shifting the rest left.
    ["3271", "Peter's Creek", "", "Charlie O'Connell", "TRUE"],
  ]);
  assert.deepEqual(sheets[1].rows, [["3090"]]);
});

test("a workbook saved without compression reads the same", async () => {
  const sheets = await readWorkbook(zip(WORKBOOK, true));
  assert.equal(sheets[0].rows[1][1], "Peter's Creek");
});

test("rows become tab-separated text, as wide as the widest row", () => {
  assert.equal(rowsToTsv([["a", "b"], ["c", "", "d", ""], ["tab\there"]]), "a\tb\t\nc\t\td\ntab here\t\t");
});

test("column letters and XML escapes", () => {
  assert.equal(columnIndex("A1"), 0);
  assert.equal(columnIndex("Z"), 25);
  assert.equal(columnIndex("AA10"), 26);
  assert.equal(decodeXml("Tom &amp; Jerry&#39;s &#x2014; &lt;b&gt;"), "Tom & Jerry's — <b>");
});

test("anything that is not a workbook is refused plainly", async () => {
  await assert.rejects(readWorkbook(new TextEncoder().encode("Store #,Name\n1,One")), /not an \.xlsx file/);
  await assert.rejects(readWorkbook(zip({ "readme.txt": "hi" })), /not an Excel workbook/);
});
