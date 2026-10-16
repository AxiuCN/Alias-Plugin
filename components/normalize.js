/**
 * 文本归一化（纯函数，零 I/O）
 *
 * 只解决一件事：**同一个词的不同写法要落到同一个键上**。
 * 不承担业务语义：不剥离命令前缀、不做目录匹配、不做模糊匹配、不做简繁转换。
 */

/** 包裹型标点：书名号 / 引号 / 括号（成对出现，做双向去除；刻意不含花括号——游戏占位符 `{NICKNAME}` 要保留） */
const WRAPPERS = ['「', '」', '『', '』', '《', '》', '【', '】', '（', '）', '(', ')', '[', ']', '“', '”', '‘', '’', '"', "'"]
/** 间隔号：同一名字的不同分隔写法（如「诺姆·霍洛维尔」与「诺姆霍洛维尔」） */
const SEPARATORS = /[·・•‧]/g

/**
 * 归一化匹配键
 *
 * 依次：去所有空白 → 去间隔号 → 去引号 / 括号 / 书名号 → 小写。
 * 去括号而不是只去包裹层：数据里既有 `A(B)` 也有 `A（B）`，统一都去掉两侧符号、保留内容。
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeKey (value) {
  return String(value ?? '')
    .replace(/\s+/g, '')
    .replace(SEPARATORS, '')
    .split('')
    .filter(ch => !WRAPPERS.includes(ch))
    .join('')
    .toLowerCase()
}

/** 去首尾空白（查询入参用；不做其他处理） */
export function trimKeyword (value) {
  return String(value ?? '').trim()
}

/**
 * 别名串 → 别名数组
 *
 * 上游数据两种形态：逗号分隔字符串（miao / 本插件自维护）、数组（ZZZ-Plugin 的别名文件）。
 * 分隔符同时支持中英文逗号与顿号（Meta 读 miao 别名时也把顿号当中文逗号用）。
 * @param {unknown} value
 * @returns {string[]} 去空白、去空项、去重后的别名数组（不含标准名本身）
 * @param {string} [canonical] - 标准名，用于剔除自我引用
 */
export function splitAliases (value, canonical = '') {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(/[,，、]/)
  const seen = new Set()
  const out = []
  const selfKey = normalizeKey(canonical)
  for (const item of raw) {
    const text = String(item ?? '').trim()
    if (!text) continue
    const key = normalizeKey(text)
    if (!key || key === selfKey || seen.has(key)) continue
    seen.add(key)
    out.push(text)
  }
  return out
}
