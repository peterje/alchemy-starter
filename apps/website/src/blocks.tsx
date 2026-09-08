import {
  type Block,
  type Inline,
  type ListItem,
  rowColumnCount,
  type TableBlock,
  type TableCell,
  type TableRow,
} from "@starter/contract/documents";
import type { ReactNode } from "react";

import { mathToHtml } from "./math.ts";

/**
 * Block renderers shared by the measuring pass and the paginated pages. The
 * same element must render identically in both places for measurements to
 * hold, so nothing here depends on component state.
 */

/** One CSS pixel at 96dpi: what collapsed table borders add beyond the column widths. */
const TABLE_BORDER_INCHES = 1 / 96;

/** Vertical distance between the rules of a lined workspace, in inches. */
export const WORKSPACE_LINE_PITCH = 0.4;

function renderInline(inline: Inline, key: number): ReactNode {
  switch (inline.type) {
    case "text": {
      let node: ReactNode = inline.text;
      if (inline.marks?.underline === true) node = <u>{node}</u>;
      if (inline.marks?.italic === true) node = <em>{node}</em>;
      if (inline.marks?.bold === true) node = <strong>{node}</strong>;
      return <span key={key}>{node}</span>;
    }
    case "math":
      return (
        <span
          key={key}
          className="doc-math"
          dangerouslySetInnerHTML={{ __html: mathToHtml(inline.latex, false) }}
        />
      );
    case "lineBreak":
      return <br key={key} />;
    case "blank":
      return <span key={key} className="doc-blank" style={{ width: `${inline.width}in` }} />;
    case "image":
      return (
        <img
          key={key}
          className="doc-inline-image"
          src={inline.src}
          alt={inline.alt}
          style={{ width: `${inline.width}in`, height: `${inline.height}in` }}
        />
      );
    default: {
      const exhaustive: never = inline;
      return exhaustive;
    }
  }
}

export function Inlines({ inlines }: Readonly<{ inlines: ReadonlyArray<Inline> }>) {
  return <>{inlines.map(renderInline)}</>;
}

interface ListTree {
  readonly item: ListItem;
  readonly children: Array<ListTree>;
}

/** Fold flat, leveled items into nested lists. Items deeper than their predecessor nest under it. */
function buildListTree(items: ReadonlyArray<ListItem>): Array<ListTree> {
  const roots: Array<ListTree> = [];
  const stack: Array<ListTree> = [];
  for (const item of items) {
    const node: ListTree = { item, children: [] };
    while (stack.length > item.level) stack.pop();
    const parent = stack.at(-1);
    if (parent === undefined) roots.push(node);
    else parent.children.push(node);
    // Fill skipped levels so a level-2 item after a level-0 item still nests.
    while (stack.length < item.level) stack.push(node);
    stack.push(node);
  }
  return roots;
}

function renderListTree(
  nodes: ReadonlyArray<ListTree>,
  style: "bullet" | "number",
  depth: number,
  start?: number,
): ReactNode {
  const items = nodes.map((node, index) => (
    <li key={index}>
      <Inlines inlines={node.item.inlines} />
      {node.children.length > 0 ? renderListTree(node.children, style, depth + 1) : null}
    </li>
  ));
  return style === "number" ? (
    <ol className={`doc-list-depth-${depth}`} start={start}>
      {items}
    </ol>
  ) : (
    <ul className={`doc-list-depth-${depth}`}>{items}</ul>
  );
}

/** Column widths in inches, from the block or divided equally, scaled to fit the content width. */
function tableColumnWidths(table: TableBlock, contentWidth: number): Array<number> {
  const [first] = table.rows;
  const columns = first === undefined ? 1 : rowColumnCount(first);
  const requested =
    table.columnWidths !== undefined && table.columnWidths.length === columns
      ? table.columnWidths
      : Array.from({ length: columns }, () => contentWidth / columns);
  const total = requested.reduce((sum, width) => sum + width, 0);
  const scale = total > contentWidth ? contentWidth / total : 1;
  return requested.map((width) => width * scale);
}

/** A block standing in for a list item indents like one and hangs its marker in the gutter. */
const labelClass = (label: string | undefined) => (label === undefined ? "" : "doc-labelled");
const labelMarker = (label: string | undefined) =>
  label === undefined ? null : <span className="doc-label">{label}</span>;

function renderBlock(block: Block, contentWidthInches: number): ReactNode {
  switch (block.type) {
    case "paragraph":
      return (
        <p style={{ textAlign: block.align ?? "left" }} className={labelClass(block.label)}>
          {labelMarker(block.label)}
          <Inlines inlines={block.inlines} />
        </p>
      );
    case "heading": {
      const content = <Inlines inlines={block.inlines} />;
      const style = { textAlign: block.align ?? "left" };
      if (block.level === 1) return <h1 style={style}>{content}</h1>;
      if (block.level === 2) return <h2 style={style}>{content}</h2>;
      return <h3 style={style}>{content}</h3>;
    }
    case "list":
      return renderListTree(buildListTree(block.items), block.style, 0, block.start);
    case "table": {
      const [firstRow] = block.rows;
      // Collapsed borders add a pixel beyond the columns; keep the outer edge inside the page.
      const widths = tableColumnWidths(block, contentWidthInches - TABLE_BORDER_INCHES);
      const bodyRows = block.headerRow === true ? block.rows.slice(1) : block.rows;
      const rowStyle = (row: TableRow) =>
        row.minHeight === undefined ? undefined : { height: `${row.minHeight}in` };
      const rowClass = (row: TableRow) =>
        row.borderless === true ? "doc-row-borderless" : undefined;
      const cellStyle = (cell: TableCell) =>
        cell.align === undefined ? undefined : { textAlign: cell.align };
      return (
        <table className={block.borderless === true ? "doc-table-borderless" : undefined}>
          <colgroup>
            {widths.map((width, index) => (
              <col key={index} style={{ width: `${width}in` }} />
            ))}
          </colgroup>
          {block.headerRow === true && firstRow !== undefined ? (
            <thead>
              <tr style={rowStyle(firstRow)} className={rowClass(firstRow)}>
                {firstRow.cells.map((cell, index) => (
                  <th key={index} style={cellStyle(cell)} colSpan={cell.colSpan}>
                    <Inlines inlines={cell.inlines} />
                  </th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {bodyRows.map((row, rowIndex) => (
              <tr key={rowIndex} style={rowStyle(row)} className={rowClass(row)}>
                {row.cells.map((cell, cellIndex) => (
                  <td key={cellIndex} style={cellStyle(cell)} colSpan={cell.colSpan}>
                    <Inlines inlines={cell.inlines} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    case "image":
      return (
        <div style={{ textAlign: block.align ?? "center" }}>
          <img
            src={block.src}
            alt={block.alt}
            style={{ width: `${block.width}in`, height: `${block.height}in` }}
          />
        </div>
      );
    case "pageBreak":
      return null;
    case "mathBlock":
      return (
        <div
          className="doc-math-block"
          dangerouslySetInnerHTML={{ __html: mathToHtml(block.latex, true) }}
        />
      );
    case "workspace":
      return (
        <div
          className={`doc-workspace doc-workspace-${block.style}`}
          style={{ height: `${block.height}in` }}
          data-line-pitch={block.style === "lines" ? WORKSPACE_LINE_PITCH : undefined}
        />
      );
    case "columns":
      return (
        <div
          className={`doc-columns ${labelClass(block.label)}`}
          style={{
            gridTemplateColumns: block.columns.map((column) => `${column.share}fr`).join(" "),
          }}
        >
          {labelMarker(block.label)}
          {block.columns.map((column, index) => (
            <div key={index} className="doc-column">
              {column.blocks.map((child) => (
                <div key={child.id} className="doc-column-block" data-kind={child.type}>
                  {renderBlock(child, contentWidthInches * column.share)}
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    default: {
      const exhaustive: never = block;
      return exhaustive;
    }
  }
}

/** One block with the wrapper the measuring pass and pagination rely on. */
export function DocumentBlock({
  block,
  contentWidthInches,
  first = false,
}: Readonly<{ block: Block; contentWidthInches: number; first?: boolean }>) {
  // The document's first block carries no space above it; page slices wrap one block each,
  // so `:first-child` cannot tell it apart from a block that merely starts a page.
  return (
    <div className="doc-block" data-kind={block.type} data-first={first ? "true" : undefined}>
      {renderBlock(block, contentWidthInches)}
    </div>
  );
}
