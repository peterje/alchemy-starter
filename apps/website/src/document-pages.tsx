import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { type DocumentState, pageGeometry } from "@starter/contract/documents";
import { Atom } from "effect/unstable/reactivity";
import { useCallback } from "react";

import { DocumentBlock } from "./blocks.tsx";
import { type PageLayout, type PageSlice, paginate } from "./document-layout.ts";
import { measureBlocks } from "./document-measure.ts";

import "katex/dist/katex.min.css";
import "./documents.css";

/** CSS pixels per inch: `in` units resolve to exactly 96px in every browser. */
const PX_PER_INCH = 96;

/** Where each document's blocks fall on its pages, kept per document so switching between them never shows the wrong layout. */
const layoutAtom = Atom.family((_documentId: string) => Atom.make<PageLayout>([]));

/**
 * Paginated, print-faithful rendering. Blocks are first laid out once in an
 * offscreen container at the page's content width, measured, and then sliced
 * into fixed-size page boxes. Each page box is exactly the paper size with
 * padding equal to the margins, so `@page { margin: 0 }` prints one box per
 * sheet and the PDF matches the screen.
 */
export function DocumentPages({
  documentId,
  state,
}: Readonly<{ documentId: string; state: DocumentState }>) {
  const geometry = pageGeometry(state.meta.page);
  const pages = useAtomValue(layoutAtom(documentId));
  const setPages = useAtomSet(layoutAtom(documentId));
  const contentHeightPx = geometry.contentHeight * PX_PER_INCH;

  // Re-created when the document changes so React runs it again on the same element. Reading
  // layout also starts the web font requests; measure again once they land.
  const measureRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (element === null) return;
      const measure = () => setPages(paginate(measureBlocks(element), contentHeightPx));
      measure();
      let cancelled = false;
      element.ownerDocument.fonts.ready.then(() => {
        if (!cancelled && element.isConnected) measure();
      });
      return () => {
        cancelled = true;
      };
    },
    [state, contentHeightPx, setPages],
  );

  const blockAt = (slice: PageSlice) => state.items[slice.blockIndex]?.item;

  return (
    <div className="doc-pages">
      <style>{`@page { size: ${geometry.width}in ${geometry.height}in; margin: 0; }`}</style>
      <div className="doc-measure" aria-hidden="true">
        <div
          ref={measureRef}
          className="doc-content"
          style={{ width: `${geometry.contentWidth}in` }}
        >
          {state.items.map((entry, index) => (
            <DocumentBlock
              key={entry.item.id}
              block={entry.item}
              contentWidthInches={geometry.contentWidth}
              first={index === 0}
            />
          ))}
        </div>
      </div>
      {pages.map((slices, pageIndex) => (
        <section
          key={pageIndex}
          className="doc-page"
          aria-label={`Page ${pageIndex + 1} of ${pages.length}`}
          style={{
            width: `${geometry.width}in`,
            height: `${geometry.height}in`,
            padding: `${geometry.margins.top}in ${geometry.margins.right}in ${geometry.margins.bottom}in ${geometry.margins.left}in`,
          }}
        >
          <div className="doc-content">
            {slices.map((slice, sliceIndex) => {
              const block = blockAt(slice);
              if (block === undefined) return null;
              // A table cut at a row boundary leaves the shared 1px border straddling the cut, so
              // each side draws its own edge; continuation is known from the neighbouring pages.
              const bordered = block.type === "table" && block.borderless !== true;
              const continued = bordered && slice.top > 0 && sliceIndex === 0;
              const continues =
                bordered &&
                sliceIndex === slices.length - 1 &&
                pages[pageIndex + 1]?.[0]?.blockIndex === slice.blockIndex;
              const className = [
                "doc-slice",
                continued ? "doc-slice-table-continued" : "",
                continues ? "doc-slice-table-continues" : "",
              ]
                .filter((name) => name.length > 0)
                .join(" ");
              return (
                <div
                  key={`${block.id}:${slice.top}`}
                  className={className}
                  style={{ height: `${slice.height}px` }}
                >
                  <div style={{ marginTop: `${-slice.top}px` }}>
                    <DocumentBlock
                      block={block}
                      contentWidthInches={geometry.contentWidth}
                      first={slice.blockIndex === 0}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
