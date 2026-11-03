/**
 * Plain words from a skill tag, for prompts and labels while B05's label map
 * (`packages/shared/src/brain/skills.ts`, `skillLabel(tag, 'teacher')`) is not on main.
 * Same rule as its fallback: the last dotted segment, dashes and underscores as spaces,
 * first letter capitalised. `factorise-trinomial` → "Factorise trinomial".
 */
export function skillWords(tag: string): string {
  const segment = tag.split('.').filter((part) => part.length > 0).at(-1) ?? tag
  const words = segment.replace(/[-_]+/g, ' ').trim()
  if (words.length === 0) return 'Skill'
  return words.charAt(0).toUpperCase() + words.slice(1)
}
