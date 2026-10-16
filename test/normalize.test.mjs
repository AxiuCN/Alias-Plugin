/**
 * 归一化与别名串拆分（纯函数，无前置）
 *
 * 只测对外行为：同一个词的不同写法必须落到同一个键上；别名串的两种形态都要认。
 */
import { checker, installFrameworkStubs, mod } from './_helper.mjs'

installFrameworkStubs()
const { normalizeKey, trimKeyword, splitAliases } = await import(mod('components/normalize.js'))

const c = checker()

// ---- normalizeKey ----
c.check('空白与大小写：Jean / JEAN / %Jean% 归一一致',
  normalizeKey('Jean') === normalizeKey('JEAN') && normalizeKey('Jean') === normalizeKey(' jean '))
c.check('间隔号：诺姆·霍洛维尔 = 诺姆霍洛维尔',
  normalizeKey('诺姆·霍洛维尔') === normalizeKey('诺姆霍洛维尔'))
c.check('包裹符号：引号 / 括号 / 书名号 均被去除',
  normalizeKey('「胡桃」') === normalizeKey('胡桃')
  && normalizeKey('胡桃(往生堂)') === normalizeKey('胡桃往生堂')
  && normalizeKey('《雾切之回光》') === normalizeKey('雾切之回光'))
c.check('游戏占位符保留花括号：{NICKNAME} 不被拆散',
  normalizeKey('{NICKNAME}') === normalizeKey('{nickname}') && normalizeKey('{NICKNAME}').includes('{'))
c.check('空值与 undefined 安全',
  normalizeKey(undefined) === '' && normalizeKey(null) === '')

// ---- trimKeyword ----
c.check('查询入参只去首尾空白',
  trimKeyword('  胡桃  ') === '胡桃' && trimKeyword(undefined) === '')

// ---- splitAliases ----
c.check('逗号分隔字符串 → 数组', JSON.stringify(splitAliases('桃,核桃,往生堂主')) === JSON.stringify(['桃', '核桃', '往生堂主']))
c.check('中文逗号与顿号同义', JSON.stringify(splitAliases('桃，核桃、往生堂主')) === JSON.stringify(['桃', '核桃', '往生堂主']))
c.check('数组形态（ZZZ-Plugin 的写法）', JSON.stringify(splitAliases(['诺姆', '霍洛维尔'])) === JSON.stringify(['诺姆', '霍洛维尔']))
c.check('剔除空项与自我引用', JSON.stringify(splitAliases(' , ,胡桃, 桃 ', '胡桃')) === JSON.stringify(['桃']))
c.check('按归一化键去重（大小写/空格不同不重复）', JSON.stringify(splitAliases('Hu Tao,hu tao, 胡桃')) === JSON.stringify(['Hu Tao', '胡桃']))
c.check('空值安全', JSON.stringify(splitAliases(undefined)) === '[]')

c.finish()
