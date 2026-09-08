import { WORKSPACE_LINE_PITCH } from "./blocks.tsx";
import type { BlockMeasure } from "./document-layout.ts";

/**
 * Measure rendered blocks inside the offscreen measuring container. Blocks
 * are laid out at the exact content width of the page, so the heights and
 * break offsets read here are the ones the paginated pages will use.
 */

interface LineBox {
  readonly top: number;
  readonly bottom: number;
}

const PX_PER_INCH = 96;

function isVisibleText(node: Node): boolean {
  const parent = node.parentElement;
  // KaTeX's MathML twin is clipped offscreen; its rects would corrupt line detection.
  return parent !== null && parent.closest(".katex-mathml") === null;
}

function lineBoxes(block: HTMLElement): ReadonlyArray<LineBox> {
  const walker = block.ownerDocument.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const rects: Array<LineBox> = [];
  const range = block.ownerDocument.createRange();
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (!isVisibleText(node) || (node.textContent ?? "").trim().length === 0) continue;
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) {
      if (rect.height > 0) rects.push({ top: rect.top, bottom: rect.bottom });
    }
  }
  rects.sort((a, b) => a.top - b.top);
  const lines: Array<LineBox> = [];
  for (const rect of rects) {
    const last = lines.at(-1);
    // Rects that vertically overlap belong to the same line (text beside inline math).
    if (last !== undefined && rect.top < last.bottom - 1) {
      lines[lines.length - 1] = {
        top: Math.min(last.top, rect.top),
        bottom: Math.max(last.bottom, rect.bottom),
      };
    } else {
      lines.push(rect);
    }
  }
  return lines;
}

function lineBreakOffsets(block: HTMLElement, blockTop: number): ReadonlyArray<number> {
  const lines = lineBoxes(block);
  const offsets: Array<number> = [];
  for (let index = 0; index + 1 < lines.length; index += 1) {
    const current = lines[index];
    const next = lines[index + 1];
    if (current === undefined || next === undefined) continue;
    // Split in the leading between two lines so neither line is clipped.
    offsets.push((current.bottom + next.top) / 2 - blockTop);
  }
  return offsets;
}

function rowBreakOffsets(block: HTMLElement, blockTop: number): ReadonlyArray<number> {
  const rows = Array.from(block.querySelectorAll("tr"));
  // A header row never ends a page on its own: the first allowed split is after the first body row.
  const first = block.querySelector("thead") === null ? 1 : 2;
  return rows.slice(first).map((row) => row.getBoundingClientRect().top - blockTop);
}

/** Ruled work space may break between rules; a box never splits. */
function workspaceBreakOffsets(block: HTMLElement, height: number): ReadonlyArray<number> {
  if (block.querySelector(".doc-workspace-lines") === null) return [];
  const pitch = WORKSPACE_LINE_PITCH * PX_PER_INCH;
  const offsets: Array<number> = [];
  for (let offset = pitch; offset < height - pitch / 2; offset += pitch) offsets.push(offset);
  return offsets;
}

export function measureBlocks(container: HTMLElement): ReadonlyArray<BlockMeasure> {
  const blocks = Array.from(container.querySelectorAll<HTMLElement>(":scope > .doc-block"));
  return blocks.map((block, index) => {
    const kind = block.dataset["kind"] ?? "paragraph";
    const nextKind = blocks[index + 1]?.dataset["kind"];
    const rect = block.getBoundingClientRect();
    let breakOffsets: ReadonlyArray<number> = [];
    switch (kind) {
      case "paragraph":
      case "heading":
      case "list":
        breakOffsets = lineBreakOffsets(block, rect.top);
        break;
      case "table":
        breakOffsets = rowBreakOffsets(block, rect.top);
        break;
      case "workspace":
        breakOffsets = workspaceBreakOffsets(block, rect.height);
        break;
      default:
        break;
    }
    return {
      height: rect.height,
      breakOffsets,
      keepLinesTogether: kind !== "table" && kind !== "workspace",
      // Headings stay with what follows; so does the prompt above a writing space.
      keepWithNext: kind === "heading" || (kind === "paragraph" && nextKind === "workspace"),
      isPageBreak: kind === "pageBreak",
    };
  });
}
