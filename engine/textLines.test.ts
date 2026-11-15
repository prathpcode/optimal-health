import { describe, expect, it } from "vitest";
import { positionsFor } from "./memory";
import { linesFromVision, type VisionText } from "./textLines";

/** A word at (x, y) of the given size, on a 1000 x 2000 photo, optionally followed by a break. */
const word = (text: string, x: number, y: number, w: number, h: number, brk?: string) => ({
  boundingBox: { vertices: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] },
  symbols: [...text].map((ch, i) => ({ text: ch, ...(brk && i === text.length - 1 ? { property: { detectedBreak: { type: brk } } } : {}) })),
});
const page = (paragraphs: ReturnType<typeof word>[][]): VisionText => ({ pages: [{ width: 1000, height: 2000, blocks: [{ paragraphs: paragraphs.map((words) => ({ words })) }] }] });

describe("linesFromVision", () => {
  it("joins words into lines and gives each line its box as fractions of the photo", () => {
    const lines = linesFromVision(page([[word("Pesto", 100, 400, 120, 40, "SPACE"), word("pasta", 230, 400, 110, 40, "EOL_SURE_SPACE"), word("basil", 100, 450, 90, 30, "SPACE"), word("pesto,", 200, 450, 100, 30, "SPACE"), word("parmesan", 310, 450, 150, 30, "LINE_BREAK")]]));
    expect(lines.map((l) => l.text)).toEqual(["Pesto pasta", "basil pesto, parmesan"]);
    expect(lines[0].box).toEqual({ left: 0.1, right: 0.34, top: 0.2, bottom: 0.22 });
  });
  it("ends a line at the end of a paragraph even with no break marked", () => {
    expect(linesFromVision(page([[word("Ramen", 100, 100, 100, 40)], [word("Paloma", 100, 300, 100, 40)]])).map((l) => l.text)).toEqual(["Ramen", "Paloma"]);
  });
  it("reads a missing coordinate as zero, as the service leaves zeros out", () => {
    const w = word("Top", 0, 0, 100, 40, "LINE_BREAK");
    w.boundingBox.vertices = [{} as { x: number; y: number }, { x: 100 } as { x: number; y: number }, { x: 100, y: 40 }, { y: 40 } as { x: number; y: number }];
    expect(linesFromVision(page([[w]]))[0].box).toEqual({ left: 0, right: 0.1, top: 0, bottom: 0.02 });
  });
  it("returns nothing without a page size, or for an empty or missing result", () => {
    expect(linesFromVision({ pages: [{ blocks: [] }] })).toEqual([]);
    expect(linesFromVision(null)).toEqual([]);
    expect(linesFromVision({})).toEqual([]);
  });
  it("produces lines that the dish matcher can place", () => {
    const lines = linesFromVision(page([
      [word("MAINS", 400, 100, 200, 50, "LINE_BREAK")],
      [word("Grilled", 100, 300, 150, 40, "SPACE"), word("salmon", 260, 300, 140, 40, "EOL_SURE_SPACE"), word("with", 100, 350, 60, 30, "SPACE"), word("lemon,", 170, 350, 90, 30, "SPACE"), word("herbs", 270, 350, 80, 30, "LINE_BREAK")],
      [word("24", 850, 300, 40, 40, "LINE_BREAK")],
    ]));
    const [boxes] = positionsFor([{ name: "Grilled salmon", description: "with lemon, herbs and steamed rice" }], lines);
    expect(boxes).toHaveLength(2);
    expect(boxes![0].top).toBe(0.15);
  });
});
