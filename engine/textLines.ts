// Turn a text-recognition result into the lines of text on a photo, each with where it is. Pure.
// The shape read here is Google Cloud Vision's `fullTextAnnotation` (DOCUMENT_TEXT_DETECTION); on-device
// recognition, when the app has it, sends the same TextLine[] directly and skips this.

import type { TextLine } from "./memory";
import type { Box, Quad } from "./types";

type Vertex = { x?: number; y?: number };
type Break = { type?: string };
type Symbol = { text?: string; property?: { detectedBreak?: Break } };
type Word = { symbols?: Symbol[]; boundingBox?: { vertices?: Vertex[] } };
export type VisionText = {
  pages?: { width?: number; height?: number; blocks?: { paragraphs?: { words?: Word[] }[] }[] }[];
};

/** Breaks that end a printed line. A hyphen break is a word split across two lines. */
const LINE_ENDS = new Set(["EOL_SURE_SPACE", "LINE_BREAK", "HYPHEN"]);
const clamp = (n: number) => Math.max(0, Math.min(1, n));

/**
 * The tightest rectangle around a set of points that is turned to `angle` (radians, in pixels), as four corners in
 * fractions of the photo. For text photographed at a tilt this hugs the line, where an upright box would not.
 */
function tiltedQuad(xs: number[], ys: number[], angle: number, width: number, height: number): Quad | null {
  if (!Number.isFinite(angle)) return null;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  // Into the line's own frame (x along the text, y down the line's height), measure, and back out.
  const us = xs.map((x, i) => x * cos + ys[i] * sin);
  const vs = xs.map((x, i) => -x * sin + ys[i] * cos);
  const u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs);
  if (!(u1 > u0) || !(v1 > v0)) return null;
  const out = (u: number, v: number) => ({ x: (u * cos - v * sin) / width, y: (u * sin + v * cos) / height });
  return [out(u0, v0), out(u1, v0), out(u1, v1), out(u0, v1)];
}

/**
 * One TextLine per printed line, in reading order, with its box as fractions of the photo. Words are joined as the
 * recogniser spaced them. Returns nothing if the result has no page size to measure against.
 */
export function linesFromVision(annotation: VisionText | null | undefined, max = 600): TextLine[] {
  const page = annotation?.pages?.[0];
  const width = page?.width ?? 0;
  const height = page?.height ?? 0;
  if (!page || !(width > 0) || !(height > 0)) return [];
  const lines: TextLine[] = [];
  let text = "";
  let xs: number[] = [];
  let ys: number[] = [];
  // The direction the line runs in: from its first word's top-left corner to its latest word's top-right.
  let from: { x: number; y: number } | null = null;
  let to: { x: number; y: number } | null = null;
  const end = () => {
    const t = text.trim();
    if (t && xs.length && ys.length) {
      const box: Box = { left: clamp(Math.min(...xs) / width), right: clamp(Math.max(...xs) / width), top: clamp(Math.min(...ys) / height), bottom: clamp(Math.max(...ys) / height) };
      if (box.right > box.left && box.bottom > box.top) {
        const quad = from && to ? tiltedQuad(xs, ys, Math.atan2(to.y - from.y, to.x - from.x), width, height) : null;
        lines.push({ text: t, box, ...(quad ? { quad } : {}) });
      }
    }
    text = "";
    xs = [];
    ys = [];
    from = null;
    to = null;
  };
  for (const block of page.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const word of paragraph.words ?? []) {
        // A coordinate of zero is left out of the response, so a missing x or y means 0.
        const corners = word.boundingBox?.vertices ?? [];
        for (const v of corners) {
          xs.push(v.x ?? 0);
          ys.push(v.y ?? 0);
        }
        // Corners come in the text's own reading order: top-left, top-right, bottom-right, bottom-left.
        if (corners.length === 4) {
          if (!from) from = { x: corners[0].x ?? 0, y: corners[0].y ?? 0 };
          to = { x: corners[1].x ?? 0, y: corners[1].y ?? 0 };
        }
        for (const s of word.symbols ?? []) {
          text += s.text ?? "";
          const kind = s.property?.detectedBreak?.type;
          if (kind === "SPACE" || kind === "SURE_SPACE") text += " ";
          else if (kind && LINE_ENDS.has(kind)) end();
        }
      }
      end(); // a paragraph never continues a line
    }
  }
  return lines.slice(0, max);
}
