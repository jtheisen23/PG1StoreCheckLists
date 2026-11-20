/**
 * Reads the sheets out of an .xlsx workbook, as rows of text.
 *
 * Rosters live in Excel, and asking an administrator to copy cells out of the
 * right tab before pasting is one more place for a row to go missing. An .xlsx
 * file is a zip of XML; this unzips it with the platform's own
 * DecompressionStream (every current browser, and Node) and reads the cell
 * values, which is all an import needs — no formatting, no formulas, no
 * dependency.
 */

export interface Sheet {
  name: string;
  rows: string[][];
}

// --- zip ------------------------------------------------------------------------

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  offset: number;
}

function zipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end-of-central-directory record sits in the last 64 KB + 22 bytes.
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("This is not an .xlsx file (no zip directory found).");

  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error("The workbook's zip directory is damaged.");
    const method = view.getUint16(at + 10, true);
    const compressedSize = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    entries.push({ name, method, compressedSize, offset });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readEntry(bytes: Uint8Array, entry: ZipEntry): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(entry.offset, true) !== 0x04034b50) throw new Error(`The workbook entry ${entry.name} is damaged.`);
  const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
  const raw = bytes.subarray(start, start + entry.compressedSize);
  const data = entry.method === 0 ? raw : entry.method === 8 ? await inflate(raw) : null;
  if (!data) throw new Error(`The workbook uses a compression this reader does not know (${entry.method}).`);
  return new TextDecoder().decode(data);
}

// --- XML ----------------------------------------------------------------------

export function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, code: string) => {
    const lower = code.toLowerCase();
    if (lower === "amp") return "&";
    if (lower === "lt") return "<";
    if (lower === "gt") return ">";
    if (lower === "quot") return '"';
    if (lower === "apos") return "'";
    return String.fromCodePoint(lower.startsWith("#x") ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10));
  });
}

/** The text of every <t> inside a fragment, joined: rich text comes in runs. */
function textOf(fragment: string): string {
  let out = "";
  for (const match of fragment.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += decodeXml(match[1]);
  return out;
}

export function parseSharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => textOf(match[1]));
}

/** "A" -> 0, "Z" -> 25, "AA" -> 26. */
export function columnIndex(reference: string): number {
  const letters = reference.replace(/[^A-Z]/gi, "").toUpperCase();
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

export function parseSheetXml(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const row: string[] = [];
    const body = rowMatch[1] ?? "";
    for (const cellMatch of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cellMatch[1];
      const inner = cellMatch[2] ?? "";
      const reference = /\br="([A-Z]+)\d+"/.exec(attributes)?.[1];
      const type = /\bt="([^"]+)"/.exec(attributes)?.[1];
      const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let value = "";
      if (type === "s") value = raw === undefined ? "" : (shared[Number(raw)] ?? "");
      else if (type === "inlineStr") value = textOf(inner);
      else if (type === "b") value = raw === "1" ? "TRUE" : raw === "0" ? "FALSE" : "";
      else if (type === "str" || type === "e") value = raw === undefined ? "" : decodeXml(raw);
      else {
        // A number. Some writers store 3062 as "3062.0"; a store number with a
        // decimal point matches nothing, so whole numbers come out whole.
        value = raw === undefined ? "" : decodeXml(raw);
        const n = Number(value);
        if (value !== "" && Number.isInteger(n) && Math.abs(n) < 1e15) value = String(n);
      }
      const index = reference ? columnIndex(reference) : row.length;
      while (row.length < index) row.push("");
      row[index] = value;
    }
    rows.push(row);
  }
  // Trailing empty rows are formatting, not data.
  while (rows.length && rows[rows.length - 1].every((cell) => cell.trim() === "")) rows.pop();
  return rows;
}

// --- workbook -------------------------------------------------------------------

export async function readWorkbook(input: ArrayBuffer | Uint8Array): Promise<Sheet[]> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const entries = zipEntries(bytes);
  const byName = new Map(entries.map((entry) => [entry.name.replace(/^\//, ""), entry]));
  const read = async (name: string) => {
    const entry = byName.get(name);
    return entry ? readEntry(bytes, entry) : null;
  };

  const workbook = await read("xl/workbook.xml");
  if (!workbook) throw new Error("This is not an Excel workbook (no xl/workbook.xml).");
  const rels = (await read("xl/_rels/workbook.xml.rels")) ?? "";
  const targets = new Map<string, string>();
  for (const match of rels.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const id = /\bId="([^"]+)"/.exec(match[1])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(match[1])?.[1];
    if (id && target) targets.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  }
  const shared = parseSharedStrings((await read("xl/sharedStrings.xml")) ?? "");

  const sheets: Sheet[] = [];
  for (const match of workbook.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    const name = decodeXml(/\bname="([^"]*)"/.exec(match[1])?.[1] ?? "");
    const relId = /\br:id="([^"]+)"/.exec(match[1])?.[1];
    const target = relId ? targets.get(relId) : undefined;
    const xml = target ? await read(target) : null;
    if (xml !== null) sheets.push({ name, rows: parseSheetXml(xml, shared) });
  }
  return sheets;
}

/** Rows as tab-separated text, the shape every import here already reads. */
export function rowsToTsv(rows: string[][]): string {
  const width = Math.max(0, ...rows.map((row) => {
    let last = row.length;
    while (last > 0 && (row[last - 1] ?? "").trim() === "") last -= 1;
    return last;
  }));
  return rows
    .map((row) =>
      Array.from({ length: width }, (_, i) => (row[i] ?? "").replace(/[\t\r\n]+/g, " ").trim()).join("\t"),
    )
    .join("\n");
}
