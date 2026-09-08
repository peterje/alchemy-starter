import type {
  Block,
  Document,
  HeadingBlock,
  Inline,
  ListItem,
  ParagraphBlock,
} from "@starter/contract/documents";
import type { Deck, Slide, SlideBlock } from "@starter/contract/slides";

/**
 * Example files offered on the Files page. Between them they exercise every
 * block kind, every slide layout, inline and display math, and a forced page
 * break, so the viewers can be judged on real material.
 */

const text = (value: string): Inline => ({ type: "text", text: value });
const bold = (value: string): Inline => ({ type: "text", text: value, marks: { bold: true } });
const italic = (value: string): Inline => ({ type: "text", text: value, marks: { italic: true } });
const math = (latex: string): Inline => ({ type: "math", latex });
const item = (level: ListItem["level"], ...inlines: ReadonlyArray<Inline>): ListItem => ({
  level,
  inlines,
});

type Unidentified<T> = T extends { readonly id: string } ? Omit<T, "id"> : never;

/** Attach sequential ids so the same example always produces the same blocks. */
const blocks = (prefix: string, items: ReadonlyArray<Unidentified<Block>>): ReadonlyArray<Block> =>
  items.map((block, index): Block => ({ ...block, id: `${prefix}-${index + 1}` }));
const slideBlocks = (
  prefix: string,
  items: ReadonlyArray<Unidentified<SlideBlock>>,
): ReadonlyArray<SlideBlock> =>
  items.map((block, index): SlideBlock => ({ ...block, id: `${prefix}-${index + 1}` }));

const paragraph = (...inlines: ReadonlyArray<Inline>): Omit<ParagraphBlock, "id"> => ({
  type: "paragraph",
  inlines,
});
const heading = (level: 1 | 2 | 3, value: string): Omit<HeadingBlock, "id"> => ({
  type: "heading",
  level,
  inlines: [text(value)],
});

const linearProblems = [
  "3x + 7 = 22",
  "5(x - 2) = 3x + 8",
  "\\frac{x}{4} - 3 = 5",
  "2(3x + 1) - 4x = 10",
  "\\frac{2x + 6}{3} = x - 1",
  "7 - 2(x + 3) = 4x + 1",
  "0.5x + 1.25 = 3.75",
  "\\frac{3}{4}x - \\frac{1}{2} = \\frac{5}{4}",
];

export const algebraWorksheet: Document = {
  meta: {
    title: "Algebra 1: Solving Linear Equations",
    page: {
      size: "letter",
      orientation: "portrait",
      margins: { top: 1, right: 1, bottom: 1, left: 1 },
    },
  },
  items: blocks("alg", [
    heading(1, "Solving Linear Equations"),
    paragraph(bold("Name: "), { type: "blank", width: 2.5 }, text("   "), bold("Date: "), {
      type: "blank",
      width: 1.5,
    }),
    paragraph(
      text("A linear equation such as "),
      math("2x + 3 = 11"),
      text(" has exactly one solution. Undo each operation in reverse order: subtract "),
      math("3"),
      text(" from both sides, then divide by "),
      math("2"),
      text(" to find "),
      math("x = 4"),
      text(". Every step must keep the equation balanced."),
    ),
    heading(2, "Worked example"),
    {
      type: "mathBlock",
      latex:
        "\\frac{2x - 4}{3} = 6 \\quad\\Longrightarrow\\quad 2x - 4 = 18 \\quad\\Longrightarrow\\quad x = 11",
    },
    {
      type: "table",
      headerRow: true,
      columnWidths: [1.2, 2.4, 2.9],
      rows: [
        {
          cells: [
            { inlines: [text("Step")] },
            { inlines: [text("Equation")] },
            { inlines: [text("Justification")] },
          ],
        },
        {
          cells: [
            { inlines: [text("1")] },
            { inlines: [math("\\frac{2x - 4}{3} = 6")] },
            { inlines: [text("Original equation")] },
          ],
        },
        {
          cells: [
            { inlines: [text("2")] },
            { inlines: [math("2x - 4 = 18")] },
            { inlines: [text("Multiply both sides by "), math("3")] },
          ],
        },
        {
          cells: [
            { inlines: [text("3")] },
            { inlines: [math("2x = 22")] },
            { inlines: [text("Add "), math("4"), text(" to both sides")] },
          ],
        },
        {
          cells: [
            { inlines: [text("4")] },
            { inlines: [math("x = 11")] },
            { inlines: [text("Divide both sides by "), math("2")] },
          ],
        },
      ],
    },
    heading(2, "Part A: Solve each equation"),
    paragraph(italic("Show every step. Circle your final answer.")),
    {
      type: "list",
      style: "number",
      items: linearProblems.map((problem) => item(0, math(problem))),
    },
    paragraph(text("Show your work for problems 1 to 4 below.")),
    { type: "workspace", style: "lines", height: 2.4 },
    { type: "pageBreak" },
    heading(2, "Part B: Slope"),
    paragraph(
      text("The line "),
      math("y = \\frac{1}{2}x"),
      text(" passes through the origin. Use the equation to answer the questions."),
    ),
    {
      type: "list",
      style: "bullet",
      items: [
        item(0, text("What is the slope of the line? Write it as a fraction.")),
        item(1, text("Hint: slope is "), math("\\frac{\\Delta y}{\\Delta x}"), text(".")),
        item(0, text("Where does the line cross the "), math("y"), text("-axis?")),
        item(0, text("Is the point "), math("(6, 3)"), text(" on the line? Explain.")),
        item(1, text("Substitute "), math("x = 6"), text(" into the equation.")),
        item(2, text("Compare the result with "), math("y = 3"), text(".")),
      ],
    },
    {
      type: "columns",
      label: "4.",
      columns: [
        {
          share: 0.5,
          blocks: [
            {
              ...paragraph(text("Sketch the line "), math("y = \\frac{1}{2}x"), text(" here.")),
              id: "alg-col-a",
            },
          ],
        },
        {
          share: 0.5,
          blocks: [
            {
              ...paragraph(text("Sketch the line "), math("y = 2x - 1"), text(" here.")),
              id: "alg-col-b",
            },
          ],
        },
      ],
    },
    { type: "workspace", style: "box", height: 2 },
    heading(2, "Part C: Systems"),
    paragraph(text("Solve the system below by substitution or elimination.")),
    { type: "mathBlock", latex: "\\begin{cases} 2x + y = 7 \\\\ x - y = 2 \\end{cases}" },
    paragraph(
      text(
        "Check your solution by substituting into both equations. The solution is the ordered pair ",
      ),
      math("(x, y)"),
      text(
        " that satisfies both. Explain, in complete sentences, why a system of two lines can have exactly one solution, no solution, or infinitely many solutions. Sketch an example of each case and label the lines with their equations. Your explanation should refer to the slopes and ",
      ),
      math("y"),
      text("-intercepts of the lines."),
    ),
    heading(3, "Challenge"),
    paragraph(
      text("Find all values of "),
      math("k"),
      text(" for which the system "),
      math("kx + 2y = 4"),
      text(" and "),
      math("3x + y = 5"),
      text(" has no solution."),
    ),
    { type: "workspace", style: "lines", height: 1.6 },
  ]),
};

const angles: ReadonlyArray<readonly [string, string, string, string]> = [
  ["30^\\circ", "\\frac{\\pi}{6}", "\\frac{1}{2}", "\\frac{\\sqrt{3}}{2}"],
  ["45^\\circ", "\\frac{\\pi}{4}", "\\frac{\\sqrt{2}}{2}", "\\frac{\\sqrt{2}}{2}"],
  ["60^\\circ", "\\frac{\\pi}{3}", "\\frac{\\sqrt{3}}{2}", "\\frac{1}{2}"],
  ["90^\\circ", "\\frac{\\pi}{2}", "1", "0"],
];

export const geometryQuiz: Document = {
  meta: {
    title: "Geometry Quiz: Right Triangles and Circles",
    page: {
      size: "a4",
      orientation: "portrait",
      margins: { top: 0.75, right: 0.75, bottom: 0.75, left: 0.75 },
    },
  },
  items: blocks("geo", [
    heading(1, "Right Triangles and Circles"),
    paragraph(bold("Name: "), { type: "blank", width: 2.5 }, text("   "), bold("Period: "), {
      type: "blank",
      width: 0.8,
    }),
    paragraph(
      text("For a right triangle with legs "),
      math("a"),
      text(" and "),
      math("b"),
      text(" and hypotenuse "),
      math("c"),
      text(", the Pythagorean theorem states:"),
    ),
    { type: "mathBlock", latex: "a^2 + b^2 = c^2" },
    {
      type: "list",
      style: "number",
      items: [
        item(
          0,
          text("A ladder leans against a wall. Its foot is "),
          math("6\\,\\text{ft}"),
          text(" from the wall and it reaches "),
          math("8\\,\\text{ft}"),
          text(" up the wall. How long is the ladder?"),
        ),
        item(0, text("Find the missing leg when "), math("c = 13"), text(" and "), math("a = 5")),
        item(0, text("Simplify: "), math("\\sqrt{50} + \\sqrt{18}")),
        item(
          0,
          text("Evaluate "),
          math("\\sin 30^\\circ \\cdot \\cos 60^\\circ + \\tan 45^\\circ"),
        ),
      ],
    },
    heading(2, "Reference table"),
    {
      type: "table",
      headerRow: true,
      rows: [
        {
          cells: [
            { inlines: [text("Degrees")] },
            { inlines: [text("Radians")] },
            { inlines: [text("sin")] },
            { inlines: [text("cos")] },
          ],
        },
        ...angles.map(([degrees, radians, sin, cos]) => ({
          cells: [
            { inlines: [math(degrees)] },
            { inlines: [math(radians)] },
            { inlines: [math(sin)] },
            { inlines: [math(cos)] },
          ],
        })),
      ],
    },
    { type: "pageBreak" },
    heading(2, "Circles"),
    paragraph(
      text("A circle with radius "),
      math("r"),
      text(" has circumference "),
      math("C = 2\\pi r"),
      text(" and area "),
      math("A = \\pi r^2"),
      text("."),
    ),
    {
      type: "list",
      style: "bullet",
      items: [
        item(
          0,
          text("A pizza has a diameter of "),
          math("14"),
          text(" inches. Find its area to the nearest square inch."),
        ),
        item(
          0,
          text("The area of a circle is "),
          math("49\\pi"),
          text(". What is its circumference?"),
        ),
        item(
          0,
          text("Write the equation of the circle centered at "),
          math("(2, -3)"),
          text(" with radius "),
          math("5"),
          text("."),
        ),
      ],
    },
    { type: "mathBlock", latex: "(x - h)^2 + (y - k)^2 = r^2" },
    { type: "workspace", style: "box", height: 2.5 },
    heading(3, "Bonus"),
    paragraph(
      text("The transformation matrix for a rotation by "),
      math("\\theta"),
      text(" is "),
      math(
        "\\begin{pmatrix} \\cos\\theta & -\\sin\\theta \\\\ \\sin\\theta & \\cos\\theta \\end{pmatrix}",
      ),
      text(". Rotate the point "),
      math("(1, 0)"),
      text(" by "),
      math("90^\\circ"),
      text("."),
    ),
    { type: "paragraph", align: "center", inlines: [italic("End of quiz")] },
  ]),
};

interface SlideFields {
  readonly title?: ReadonlyArray<Inline>;
  readonly subtitle?: ReadonlyArray<Inline>;
  readonly notes?: string;
  readonly body?: ReadonlyArray<Unidentified<SlideBlock>>;
  readonly secondary?: ReadonlyArray<Unidentified<SlideBlock>>;
}

const slide = (
  id: string,
  layout: Slide["layout"],
  { body = [], secondary, ...fields }: SlideFields,
): Slide => {
  const built: Slide = { ...fields, id, layout, body: slideBlocks(`${id}-body`, body) };
  if (secondary === undefined) return built;
  return { ...built, secondary: slideBlocks(`${id}-secondary`, secondary) };
};

export const linearEquationsLesson: Deck = {
  meta: { title: "Solving Linear Equations" },
  items: [
    slide("lesson-1", "title", {
      title: [text("Solving Linear Equations")],
      subtitle: [text("Algebra 1 · Unit 2, Lesson 4")],
      notes: "Welcome the class and connect to yesterday's balance-scale activity.",
    }),
    slide("lesson-2", "content", {
      title: [text("Learning objectives")],
      body: [
        {
          type: "list",
          style: "number",
          items: [
            item(0, text("Solve one-variable linear equations by undoing operations")),
            item(0, text("Check a solution by substitution")),
            item(0, text("Explain each step using the properties of equality")),
          ],
        },
      ],
      notes: "Read the objectives aloud; ask students which one feels hardest.",
    }),
    slide("lesson-3", "content", {
      title: [text("Warm-up")],
      body: [
        paragraph(text("What value of "), math("x"), text(" makes each equation true?")),
        {
          type: "list",
          style: "bullet",
          items: [
            item(0, math("x + 5 = 12")),
            item(0, math("3x = 21")),
            item(0, math("\\frac{x}{4} = 6")),
          ],
        },
      ],
    }),
    slide("lesson-4", "content", {
      title: [text("Worked example")],
      body: [
        paragraph(text("Solve "), math("\\frac{2x - 4}{3} = 6"), text(".")),
        {
          type: "mathBlock",
          latex:
            "\\frac{2x - 4}{3} = 6 \\quad\\Longrightarrow\\quad 2x - 4 = 18 \\quad\\Longrightarrow\\quad x = 11",
        },
        paragraph(bold("Check: "), math("\\frac{2(11) - 4}{3} = \\frac{18}{3} = 6")),
      ],
      notes: "Have students name the property used at each arrow.",
    }),
    slide("lesson-5", "twoColumn", {
      title: [text("Same steps, two ways")],
      body: [
        paragraph(bold("Undo operations")),
        {
          type: "list",
          style: "number",
          items: [
            item(0, text("Multiply both sides by "), math("3")),
            item(0, text("Add "), math("4"), text(" to both sides")),
            item(0, text("Divide both sides by "), math("2")),
          ],
        },
      ],
      secondary: [
        paragraph(bold("Balance scale")),
        paragraph(
          text(
            "Whatever you do to one side, do to the other. The scale stays level, so the equation stays true.",
          ),
        ),
      ],
    }),
    slide("lesson-6", "content", {
      title: [text("Try it: match the step to the property")],
      body: [
        {
          type: "table",
          headerRow: true,
          rows: [
            { cells: [{ inlines: [text("Step")] }, { inlines: [text("Property")] }] },
            {
              cells: [
                { inlines: [math("5x - 3 = 12 \\rightarrow 5x = 15")] },
                { inlines: [text("Addition property of equality")] },
              ],
            },
            {
              cells: [
                { inlines: [math("5x = 15 \\rightarrow x = 3")] },
                { inlines: [text("Division property of equality")] },
              ],
            },
          ],
        },
      ],
    }),
    slide("lesson-7", "content", {
      title: [text("Exit ticket")],
      body: [
        paragraph(text("On your index card, solve and check:")),
        { type: "mathBlock", latex: "4(x - 2) + 6 = 2x + 10" },
        paragraph(text("Then write one sentence explaining your first step.")),
      ],
      notes: "Collect cards at the door; sort into three piles for tomorrow's warm-up.",
    }),
  ],
};
