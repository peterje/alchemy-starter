import katex from "katex";

// The measuring pass and the page pass render every formula; KaTeX is the slow part of both.
const rendered = new Map<string, string>();

/** LaTeX to KaTeX HTML plus MathML. Rendered locally with trust disabled, so no document text becomes markup. */
export function mathToHtml(latex: string, displayMode: boolean): string {
  const key = `${displayMode ? "display" : "inline"}:${latex}`;
  const cached = rendered.get(key);
  if (cached !== undefined) return cached;
  const html = katex.renderToString(latex, {
    throwOnError: false,
    strict: "ignore",
    trust: false,
    errorColor: "#b91c1c",
    output: "htmlAndMathml",
    displayMode,
  });
  rendered.set(key, html);
  return html;
}
