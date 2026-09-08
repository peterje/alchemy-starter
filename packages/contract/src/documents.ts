import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";

import { InvalidOperation, ItemId, VersionedFile } from "./versioning.ts";

/**
 * Structured document model for printable materials. Every block is explicit
 * JSON so every renderer paginates and typesets the same content. Math stores
 * LaTeX source only.
 */

export const DocumentId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand("DocumentId"));
export type DocumentId = typeof DocumentId.Type;

// Finite rather than Number: Number also accepts "Infinity" and "NaN" strings.
const Inches = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 20 }));

export const PageSettings = Schema.Struct({
  size: Schema.Literals(["letter", "a4"]),
  orientation: Schema.Literals(["portrait", "landscape"]),
  margins: Schema.Struct({ top: Inches, right: Inches, bottom: Inches, left: Inches }),
});
export type PageSettings = typeof PageSettings.Type;

// Compact margins, still inside every printer's safe area.
export const defaultPageSettings: PageSettings = {
  size: "letter",
  orientation: "portrait",
  margins: { top: 0.6, right: 0.6, bottom: 0.6, left: 0.6 },
};

/** Physical page dimensions in inches for each paper size. */
const paperInches = {
  letter: { width: 8.5, height: 11 },
  a4: { width: 8.27, height: 11.69 },
};

/** Page settings resolved into the dimensions every renderer shares, in inches. */
export const pageGeometry = (page: PageSettings) => {
  const paper = paperInches[page.size];
  const width = page.orientation === "portrait" ? paper.width : paper.height;
  const height = page.orientation === "portrait" ? paper.height : paper.width;
  return {
    width,
    height,
    margins: page.margins,
    contentWidth: width - page.margins.left - page.margins.right,
    contentHeight: height - page.margins.top - page.margins.bottom,
  };
};

const Latex = Schema.String.check(Schema.isMaxLength(5_000));

export const TextInline = Schema.Struct({
  type: Schema.Literal("text"),
  text: Schema.String.check(Schema.isMaxLength(50_000)),
  marks: Schema.optionalKey(
    Schema.Struct({
      bold: Schema.optionalKey(Schema.Boolean),
      italic: Schema.optionalKey(Schema.Boolean),
      underline: Schema.optionalKey(Schema.Boolean),
    }),
  ),
});
export type TextInline = typeof TextInline.Type;

/** Images are https URLs, never embedded bytes: a whole file is one row in its object's database. */
export const ImageSrc = Schema.String.check(
  Schema.isPattern(/^https:\/\/[^\s"'<>]+$/u),
  Schema.isMaxLength(2_048),
);
export type ImageSrc = typeof ImageSrc.Type;

export const Inline = Schema.Union([
  TextInline,
  Schema.Struct({ type: Schema.Literal("math"), latex: Latex }),
  /** A hard line break inside a paragraph, without starting a new block. */
  Schema.Struct({ type: Schema.Literal("lineBreak") }),
  /** An image that flows with text. */
  Schema.Struct({
    type: Schema.Literal("image"),
    src: ImageSrc,
    alt: Schema.String,
    width: Inches,
    height: Inches,
  }),
  /** A fill-in line: the blank a student writes on, drawn as a rule of a fixed width. */
  Schema.Struct({ type: Schema.Literal("blank"), width: Inches }),
]);
export type Inline = typeof Inline.Type;

const Inlines = Schema.Array(Inline);

export const Alignment = Schema.Literals(["left", "center", "right", "justify"]);
export type Alignment = typeof Alignment.Type;

/** A list marker such as `2.` for a block that stands in for a list item. */
const ListLabel = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(8));

const identified = { id: ItemId };

export const ParagraphBlock = Schema.Struct({
  ...identified,
  type: Schema.Literal("paragraph"),
  inlines: Inlines,
  align: Schema.optionalKey(Alignment),
  label: Schema.optionalKey(ListLabel),
});
export type ParagraphBlock = typeof ParagraphBlock.Type;

export const HeadingBlock = Schema.Struct({
  ...identified,
  type: Schema.Literal("heading"),
  level: Schema.Literals([1, 2, 3]),
  inlines: Inlines,
  align: Schema.optionalKey(Alignment),
});
export type HeadingBlock = typeof HeadingBlock.Type;

export const ListItem = Schema.Struct({ level: Schema.Literals([0, 1, 2]), inlines: Inlines });
export type ListItem = typeof ListItem.Type;

export const ListBlock = Schema.Struct({
  ...identified,
  type: Schema.Literal("list"),
  style: Schema.Literals(["bullet", "number"]),
  items: Schema.Array(ListItem).check(Schema.isMinLength(1)),
  /** First number of a numbered list that continues an earlier one; omitted means 1. */
  start: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 2, maximum: 999 }))),
});
export type ListBlock = typeof ListBlock.Type;

export const TableCell = Schema.Struct({
  inlines: Inlines,
  align: Schema.optionalKey(Alignment),
  /** Grid columns this cell covers; omitted means one. */
  colSpan: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 2, maximum: 20 }))),
});
export type TableCell = typeof TableCell.Type;

export const TableRow = Schema.Struct({
  cells: Schema.Array(TableCell).check(Schema.isMinLength(1)),
  /** Minimum row height in inches. Empty rows with a height are student work space. */
  minHeight: Schema.optionalKey(Inches),
  /** A connector or spacer row inside a bordered table: its cells draw no borders. */
  borderless: Schema.optionalKey(Schema.Boolean),
});
export type TableRow = typeof TableRow.Type;

export const rowColumnCount = (row: TableRow): number =>
  row.cells.reduce((total, cell) => total + (cell.colSpan ?? 1), 0);

// Every row must cover the same number of grid columns so column widths are well defined.
const rectangularRows = Schema.makeFilter<ReadonlyArray<TableRow>>(
  (rows) => {
    const [first] = rows;
    if (first === undefined) return true;
    const columns = rowColumnCount(first);
    return (
      rows.every((row) => rowColumnCount(row) === columns) ||
      "every table row must cover the same number of columns"
    );
  },
  { title: "rectangular" },
);

export const TableBlock = Schema.Struct({
  ...identified,
  type: Schema.Literal("table"),
  rows: Schema.Array(TableRow).check(Schema.isMinLength(1), rectangularRows),
  headerRow: Schema.optionalKey(Schema.Boolean),
  /** Column widths in inches. Omit to divide the content width equally. */
  columnWidths: Schema.optionalKey(Schema.Array(Inches)),
  /** A layout table: cells arrange content and draw no borders. */
  borderless: Schema.optionalKey(Schema.Boolean),
});
export type TableBlock = typeof TableBlock.Type;

export const ImageBlock = Schema.Struct({
  ...identified,
  type: Schema.Literal("image"),
  src: ImageSrc,
  alt: Schema.String,
  width: Inches,
  height: Inches,
  align: Schema.optionalKey(Schema.Literals(["left", "center", "right"])),
});
export type ImageBlock = typeof ImageBlock.Type;

export const PageBreakBlock = Schema.Struct({ ...identified, type: Schema.Literal("pageBreak") });
export type PageBreakBlock = typeof PageBreakBlock.Type;

export const MathBlock = Schema.Struct({
  ...identified,
  type: Schema.Literal("mathBlock"),
  latex: Latex,
});
export type MathBlock = typeof MathBlock.Type;

/** Room for student writing: ruled lines or an empty box of a given height. */
export const WorkspaceBlock = Schema.Struct({
  ...identified,
  type: Schema.Literal("workspace"),
  style: Schema.Literals(["lines", "box"]),
  height: Inches,
});
export type WorkspaceBlock = typeof WorkspaceBlock.Type;

/** What a column may hold: flowing content, no tables or further columns. */
const ColumnBlock = Schema.Union([ParagraphBlock, HeadingBlock, ListBlock, ImageBlock, MathBlock]);

export const Column = Schema.Struct({
  /** Share of the content width, 0 to 1; a row's shares add up to at most 1. */
  share: Schema.Number.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(1)),
  blocks: Schema.Array(ColumnBlock).check(Schema.isMinLength(1)),
});
export type Column = typeof Column.Type;

/** Content set side by side, laid out on one line and never split across pages. */
export const ColumnsBlock = Schema.Struct({
  ...identified,
  type: Schema.Literal("columns"),
  label: Schema.optionalKey(ListLabel),
  columns: Schema.Array(Column).check(
    Schema.isMinLength(2),
    Schema.isMaxLength(4),
    Schema.makeFilter<ReadonlyArray<Column>>(
      (columns) =>
        columns.reduce((total, column) => total + column.share, 0) <= 1.0001 ||
        "column shares must add up to at most 1",
      { title: "sharesFit" },
    ),
  ),
});
export type ColumnsBlock = typeof ColumnsBlock.Type;

export const Block = Schema.Union([
  ParagraphBlock,
  HeadingBlock,
  ListBlock,
  TableBlock,
  ImageBlock,
  PageBreakBlock,
  MathBlock,
  WorkspaceBlock,
  ColumnsBlock,
]);
export type Block = typeof Block.Type;

export const DocumentTitle = Schema.Trim.check(Schema.isNonEmpty(), Schema.isMaxLength(200));

export const DocumentMeta = Schema.Struct({ title: DocumentTitle, page: PageSettings });
export type DocumentMeta = typeof DocumentMeta.Type;

export const DocumentFile = VersionedFile(DocumentMeta, Block);
export const Document = DocumentFile.Content;
export type Document = typeof Document.Type;
export const DocumentState = DocumentFile.State;
export type DocumentState = typeof DocumentState.Type;
export const DocumentOperation = DocumentFile.Operation;
export type DocumentOperation = typeof DocumentOperation.Type;
export const DocumentOperationResult = DocumentFile.Result;
export type DocumentOperationResult = typeof DocumentOperationResult.Type;

export class DocumentNotFound extends Schema.TaggedError<DocumentNotFound>()(
  "DocumentNotFound",
  { id: DocumentId },
  { httpApiStatus: 404 },
) {}

/** Backed by the document's object: its state and block-granularity edits. */
export class DocumentsGroup extends HttpApiGroup.make("documents")
  .add(
    HttpApiEndpoint.get("get", "/", {
      params: { documentId: DocumentId },
      success: DocumentState,
      error: DocumentNotFound,
    }),
    /** Replace the whole document: new revision, every block back to version 1. */
    HttpApiEndpoint.put("set", "/", {
      params: { documentId: DocumentId },
      payload: Document,
      success: DocumentState,
    }),
    HttpApiEndpoint.post("apply", "/operations", {
      params: { documentId: DocumentId },
      payload: DocumentOperation,
      success: DocumentOperationResult,
      error: [DocumentNotFound, InvalidOperation],
    }),
  )
  .prefix("/documents/:documentId") {}
