/**
 * Pure pagination over measured blocks. Measurement happens in the DOM
 * (`document-measure.ts`); this module only decides where pages end, so the
 * result is deterministic.
 */

export interface BlockMeasure {
  /** Total rendered height of the block in CSS pixels, spacing included. */
  readonly height: number;
  /** Offsets from the block's top where it may be split (line and row boundaries), ascending. */
  readonly breakOffsets: ReadonlyArray<number>;
  /** Apply orphan and widow control (text lines); tables may split after any row. */
  readonly keepLinesTogether: boolean;
  /** Headings stay with the block that follows them. */
  readonly keepWithNext: boolean;
  /** Forced page break: never rendered, always starts a new page. */
  readonly isPageBreak: boolean;
}

export interface PageSlice {
  readonly blockIndex: number;
  /** Offset into the block where this slice starts. */
  readonly top: number;
  /** Visible height of the slice. */
  readonly height: number;
}

export type PageLayout = ReadonlyArray<ReadonlyArray<PageSlice>>;

/** Minimum lines kept together on either side of a split (orphan and widow control). */
const MIN_LINES = 2;

/** Height the blocks after `index` need on the same page for a heading at `index - 1` not to be stranded. */
function leadHeight(
  measures: ReadonlyArray<BlockMeasure>,
  index: number,
  contentHeight: number,
): number {
  const measure = measures[index];
  if (measure === undefined || measure.isPageBreak) return 0;
  // A block that itself keeps with its follower drags that follower's lead along, so a heading
  // above a prompt above a writing space moves as one.
  if (measure.keepWithNext) {
    return Math.min(
      measure.height + leadHeight(measures, index + 1, contentHeight),
      contentHeight / 3,
    );
  }
  // Orphan and widow control means a block shorter than 2 * MIN_LINES never splits, so all of it
  // must follow the heading; a longer one needs only its first MIN_LINES lines.
  const lines = measure.breakOffsets.length + 1;
  const splittable = !measure.keepLinesTogether || lines >= MIN_LINES * 2;
  const lead = splittable
    ? (measure.breakOffsets[MIN_LINES - 1] ?? measure.height)
    : measure.height;
  return Math.min(lead, contentHeight / 3);
}

function chooseSplit(
  measure: BlockMeasure,
  start: number,
  remaining: number,
  relaxed: boolean,
): number | undefined {
  const offsets = measure.breakOffsets.filter(
    (offset) => offset > start && offset < measure.height,
  );
  const fitting = offsets.filter((offset) => offset - start <= remaining);
  if (fitting.length === 0) return undefined;
  if (relaxed || !measure.keepLinesTogether) return fitting.at(-1);
  // Keep at least MIN_LINES lines on both sides of the split.
  const acceptable = fitting.filter((offset) => {
    const before = offsets.indexOf(offset) + 1;
    const after = offsets.length - offsets.indexOf(offset);
    return before >= MIN_LINES && after >= MIN_LINES;
  });
  return acceptable.at(-1);
}

/** Lay blocks out into pages of `contentHeight` pixels. */
export function paginate(measures: ReadonlyArray<BlockMeasure>, contentHeight: number): PageLayout {
  const pages: Array<Array<PageSlice>> = [[]];
  let y = 0;

  const currentPage = (): Array<PageSlice> => {
    const page = pages.at(-1);
    if (page === undefined) throw new Error("pagination invariant: no current page");
    return page;
  };
  const newPage = () => {
    pages.push([]);
    y = 0;
  };

  const place = (blockIndex: number, measure: BlockMeasure, start: number) => {
    // Loop rather than recurse so a block spanning many pages cannot blow the stack.
    let offset = start;
    while (true) {
      const remaining = contentHeight - y;
      const height = measure.height - offset;
      if (height <= remaining) {
        currentPage().push({ blockIndex, top: offset, height });
        y += height;
        return;
      }
      const pageIsEmpty = currentPage().length === 0;
      const split = chooseSplit(measure, offset, remaining, pageIsEmpty);
      if (split !== undefined) {
        currentPage().push({ blockIndex, top: offset, height: split - offset });
        newPage();
        offset = split;
        continue;
      }
      if (!pageIsEmpty) {
        newPage();
        continue;
      }
      // Taller than a page with nowhere to split: show what fits and clip the rest.
      currentPage().push({ blockIndex, top: offset, height });
      y += height;
      return;
    }
  };

  measures.forEach((measure, blockIndex) => {
    if (measure.isPageBreak) {
      newPage();
      return;
    }
    if (measure.keepWithNext && currentPage().length > 0) {
      const needed = measure.height + leadHeight(measures, blockIndex + 1, contentHeight);
      if (needed > contentHeight - y) newPage();
    }
    place(blockIndex, measure, 0);
  });

  return pages;
}
