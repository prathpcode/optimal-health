// Turn a text-recognition result into the lines of text on a photo, each with where it is. Pure.
// The shape read here is Google Cloud Vision's `fullTextAnnotation` (DOCUMENT_TEXT_DETECTION); on-device
// recognition, when the app has it, sends the same TextLine[] directly and skips this.

import type { TextLine } from "./memory";
import type { Box } from "./types";

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
  const end = () => {
    const t = text.trim();
    if (t && xs.length && ys.length) {
      const box: Box = { left: clamp(Math.min(...xs) / width), right: clamp(Math.max(...xs) / width), top: clamp(Math.min(...ys) / height), bottom: clamp(Math.max(...ys) / height) };
      if (box.right > box.left && box.bottom > box.top) lines.push({ text: t, box });
    }
    text = "";
    xs = [];
    ys = [];
  };
  for (const block of page.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const word of paragraph.words ?? []) {
        // A coordinate of zero is left out of the response, so a missing x or y means 0.
        for (const v of word.boundingBox?.vertices ?? []) {
          xs.push(v.x ?? 0);
          ys.push(v.y ?? 0);
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
