/** "שיר אחד" / "12 שירים" / "1,234 שירים". */
export const songCount = (n: number): string => (n === 1 ? 'שיר אחד' : `${n.toLocaleString('he-IL')} שירים`);
