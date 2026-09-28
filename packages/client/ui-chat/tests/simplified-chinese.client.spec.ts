import { describe, expect, it } from 'vitest'
import { toSimplifiedChinese } from '../src/client/simplified-chinese.ts'

describe('assistant Simplified Chinese presentation', () => {
  it('converts Traditional Chinese prose to Simplified Chinese', () => {
    expect(toSimplifiedChinese('幾何解析完成。關鍵資訊：輪廓尚待審核。'))
      .toBe('几何解析完成。关键信息：轮廓尚待审核。')
  })

  it('does not rewrite fenced or inline code', () => {
    expect(toSimplifiedChinese('說明 `關鍵資訊`\n```text\n幾何輪廓\n```'))
      .toBe('说明 `關鍵資訊`\n```text\n幾何輪廓\n```')
  })

  it('protects an unfinished streaming code fence', () => {
    expect(toSimplifiedChinese('結果：\n```json\n{"資訊":"幾何"}'))
      .toBe('结果：\n```json\n{"資訊":"幾何"}')
  })
})
