// Shrinks a font size so the text fits the box width (condensed display face ~0.47em per character).
export const fit = (text: string, base: number, boxWidth: number, charWidth = 0.47): number =>
  Math.min(base, boxWidth / (Math.max(text.length, 1) * charWidth));
