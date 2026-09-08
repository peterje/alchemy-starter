import type { Block, Inline, ListItem } from "@starter/contract/documents";
import type { ReactNode } from "react";

/** Read-only rendering of document content. Every block kind renders, so nothing is silently dropped. */

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
      return <code key={key}>{inline.latex}</code>;
    case "lineBreak":
      return <br key={key} />;
    case "blank":
      return <span key={key} className="blank" style={{ width: `${inline.width}in` }} />;
    case "image":
      return (
        <img
          key={key}
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

function ListItems({ items }: Readonly<{ items: ReadonlyArray<ListItem> }>) {
  return (
    <>
      {items.map((item, index) => (
        <li key={index} style={{ marginLeft: `${item.level * 1.5}rem` }}>
          <Inlines inlines={item.inlines} />
        </li>
      ))}
    </>
  );
}

function renderBlock(block: Block): ReactNode {
  switch (block.type) {
    case "paragraph":
      return (
        <p style={{ textAlign: block.align ?? "left" }}>
          {block.label === undefined ? null : <span className="label">{block.label} </span>}
          <Inlines inlines={block.inlines} />
        </p>
      );
    case "heading": {
      const style = { textAlign: block.align ?? "left" };
      const content = <Inlines inlines={block.inlines} />;
      if (block.level === 1) return <h2 style={style}>{content}</h2>;
      if (block.level === 2) return <h3 style={style}>{content}</h3>;
      return <h4 style={style}>{content}</h4>;
    }
    case "list":
      return block.style === "number" ? (
        <ol start={block.start}>
          <ListItems items={block.items} />
        </ol>
      ) : (
        <ul>
          <ListItems items={block.items} />
        </ul>
      );
    case "table":
      return (
        <table className={block.borderless === true ? "borderless" : undefined}>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                style={{ height: row.minHeight === undefined ? undefined : `${row.minHeight}in` }}
              >
                {row.cells.map((cell, cellIndex) =>
                  block.headerRow === true && rowIndex === 0 ? (
                    <th key={cellIndex} colSpan={cell.colSpan} style={{ textAlign: cell.align }}>
                      <Inlines inlines={cell.inlines} />
                    </th>
                  ) : (
                    <td key={cellIndex} colSpan={cell.colSpan} style={{ textAlign: cell.align }}>
                      <Inlines inlines={cell.inlines} />
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "image":
      return (
        <figure style={{ textAlign: block.align ?? "center" }}>
          <img
            src={block.src}
            alt={block.alt}
            style={{ width: `${block.width}in`, height: `${block.height}in` }}
          />
        </figure>
      );
    case "pageBreak":
      return <hr />;
    case "mathBlock":
      return (
        <p className="math">
          <code>{block.latex}</code>
        </p>
      );
    case "workspace":
      return <div className={`workspace ${block.style}`} style={{ height: `${block.height}in` }} />;
    case "columns":
      return (
        <div
          className="columns"
          style={{
            gridTemplateColumns: block.columns.map((column) => `${column.share}fr`).join(" "),
          }}
        >
          {block.columns.map((column, index) => (
            <div key={index}>
              <Blocks blocks={column.blocks} />
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

export function Blocks({ blocks }: Readonly<{ blocks: ReadonlyArray<Block> }>) {
  return (
    <>
      {blocks.map((block) => (
        <div key={block.id} className="block" data-kind={block.type}>
          {renderBlock(block)}
        </div>
      ))}
    </>
  );
}
