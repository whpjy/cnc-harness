/** Deterministic Traditional-to-Simplified conversion for assistant-authored UI copy. */
import OpenCC from 'opencc-js'

// `twp` also normalizes Taiwan-specific vocabulary (for example 資訊 -> 信息)
// instead of only replacing Traditional characters.
const convert = OpenCC.Converter({ from: 'twp', to: 'cn' })

// Keep Markdown code spans/fences byte-for-byte stable. The final `$` alternatives
// also protect an unfinished block while the model is still streaming it.
const MARKDOWN_CODE = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\r\n]*(?:`|$))/gu

/** Convert visible prose to Mainland Simplified Chinese without rewriting code. */
export function toSimplifiedChinese(text: string): string {
  if (text === '') return text
  let cursor = 0
  let output = ''
  for (const match of text.matchAll(MARKDOWN_CODE)) {
    const index = match.index
    output += convert(text.slice(cursor, index))
    output += match[0]
    cursor = index + match[0].length
  }
  return output + convert(text.slice(cursor))
}
