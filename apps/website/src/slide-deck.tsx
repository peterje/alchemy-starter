import type { Slide } from "@starter/contract/slides";
import { type ReactNode, useCallback } from "react";

import { DocumentBlock, Inlines } from "./blocks.tsx";

import "katex/dist/katex.min.css";
import "./slides.css";

/** CSS pixels per inch: `in` units resolve to exactly 96px in every browser. */
const PX_PER_INCH = 96;

/** A 16:9 slide in inches, as presentation software sizes it. */
const slide = {
  width: 13.333,
  height: 7.5,
  padding: 0.6,
  /** Height reserved for the title band on content layouts. */
  titleHeight: 1.1,
  /** Gap between the title band and the body, and between columns. */
  gap: 0.3,
};

const bodyWidth = (layout: Slide["layout"]) => {
  const full = slide.width - slide.padding * 2;
  return layout === "twoColumn" ? (full - slide.gap) / 2 : full;
};

function Blocks({ blocks, width }: Readonly<{ blocks: Slide["body"]; width: number }>) {
  return (
    <>
      {blocks.map((block) => (
        <DocumentBlock key={block.id} block={block} contentWidthInches={width} />
      ))}
    </>
  );
}

/**
 * One slide at its real size. Content that does not fit is clipped and the
 * slide is flagged, since a slide cannot grow.
 */
export function SlideView({ slide: current }: Readonly<{ slide: Slide }>) {
  const overflowRef = useCallback((element: HTMLElement | null) => {
    if (element === null) return;
    const check = () => {
      const body = element.querySelector(".slide-inner");
      const overflows =
        body !== null &&
        (body.scrollHeight > body.clientHeight + 1 || body.scrollWidth > body.clientWidth + 1);
      element.classList.toggle("slide-overflow", overflows);
    };
    check();
    element.ownerDocument.fonts.ready.then(() => {
      if (element.isConnected) check();
    });
  }, []);

  const width = bodyWidth(current.layout);
  return (
    <div
      ref={overflowRef}
      className={`slide slide-layout-${current.layout}`}
      style={{ width: `${slide.width}in`, height: `${slide.height}in` }}
    >
      <div className="slide-inner" style={{ padding: `${slide.padding}in` }}>
        {current.layout === "title" ? (
          <div className="slide-title-layout">
            <h1 className="slide-heading">
              <Inlines inlines={current.title ?? []} />
            </h1>
            {current.subtitle === undefined ? null : (
              <p className="slide-subtitle">
                <Inlines inlines={current.subtitle} />
              </p>
            )}
          </div>
        ) : (
          <>
            {current.layout !== "blank" && current.title !== undefined ? (
              <h2
                className="slide-heading slide-band"
                style={{ minHeight: `${slide.titleHeight}in` }}
              >
                <Inlines inlines={current.title} />
              </h2>
            ) : null}
            {current.layout === "twoColumn" ? (
              <div className="slide-columns" style={{ gap: `${slide.gap}in` }}>
                <div className="slide-content">
                  <Blocks blocks={current.body} width={width} />
                </div>
                <div className="slide-content">
                  <Blocks blocks={current.secondary ?? []} width={width} />
                </div>
              </div>
            ) : (
              <div className="slide-content">
                <Blocks blocks={current.body} width={width} />
              </div>
            )}
          </>
        )}
      </div>
      <span className="slide-overflow-badge" aria-live="polite">
        Content overflows this slide
      </span>
    </div>
  );
}

/**
 * Stacks slides and scales them to the available width. Scaling is a
 * transform, so a slide's internal layout is identical on screen and in print.
 */
export function Deck({ children }: Readonly<{ children: ReactNode }>) {
  const scaleRef = useCallback((element: HTMLDivElement | null) => {
    if (element === null) return;
    const natural = slide.width * PX_PER_INCH;
    const apply = () => {
      element.style.setProperty(
        "--slide-scale",
        String(Math.min(1, element.clientWidth / natural)),
      );
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={scaleRef} className="deck">
      {children}
    </div>
  );
}
