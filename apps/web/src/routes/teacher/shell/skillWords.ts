/**
 * Teacher wording for a skill tag. B05's label map (`skillLabel(tag, 'teacher')` from
 * `@guardian-book/shared`) is not on main yet; this is its fallback rule, so a chip never
 * shows a raw tag: the last dotted segment, dashes and underscores as spaces, capitalised.
 */
export function skillWords(tag: string): string {
  const segment = tag.split('.').filter((part) => part.length > 0).at(-1) ?? tag
  const words = segment.replace(/[-_]+/g, ' ').trim()
  if (words.length === 0) return 'Skill'
  return words.charAt(0).toUpperCase() + words.slice(1)
}
