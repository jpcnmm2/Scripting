/**
 * 配置读写。使用 Storage（脚本私有域），index.tsx 与 widget.tsx 共享。
 */
import { DEFAULT_SETTINGS, type SGCCSettings } from './types'

const KEY = 'sgcc.settings'

/** 刷新间隔可选项（分钟）：4/6/8/12/24 小时 */
const INTERVAL_OPTIONS = [240, 360, 480, 720, 1440]
const INTERVAL_DEFAULT = 480

export function loadSettings(): SGCCSettings {
  const raw = Storage.get<Partial<SGCCSettings>>(KEY)
  // 与默认值合并，保证新增字段有兜底
  const merged = !raw || typeof raw !== 'object'
    ? { ...DEFAULT_SETTINGS }
    : { ...DEFAULT_SETTINGS, ...raw }
  // 阶梯口径仅保留「按年累计」；临时让旧的按月配置也退回到年度
  merged.stepMode = '年'
  // 旧版刷新间隔（如 60/120 分钟）不在新可选项内时，回退到默认 8 小时
  if (!INTERVAL_OPTIONS.includes(merged.interval)) {
    merged.interval = INTERVAL_DEFAULT
  }
  return merged
}

export function saveSettings(settings: SGCCSettings): boolean {
  return Storage.set(KEY, settings)
}

export function resetSettings(): void {
  Storage.remove(KEY)
}
