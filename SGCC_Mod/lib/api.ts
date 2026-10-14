/**
 * 取数：网上国网 App 官方直连接口（SM2/SM3/SM4 加密 + Turing 设备令牌）。
 * 移植自 Scriptable SGCC.js v2.3.4（@脑瓜 / @anker1209），不再依赖 wsgw 重写代理。
 * 带缓存与失败退回：新鲜缓存 → 在线请求 → 过期缓存。
 */
import { fetch } from 'scripting'
import { readCache, writeCache, cacheAgeMinutes } from './cache'
import { buildViewModel, nowString } from './calc'
import { SgApp, queryAccount, SgError, K } from './sgcc-protocol'
import type { BillViewModel, RawAccount, SGCCSettings } from './types'

const CACHE_KEY = 'BillData.json'
/** 在线请求尝试次数。失败时宁可退回缓存，也不要把小组件卡死 */
const MAX_ATTEMPTS = 1

/** 协议账户信息（登录后由 powerUserList 归一化而来） */
interface SgAcct {
  consNo: string
  src: string
  pro: string
  org: string
  elec: string
  name: string
  orgName: string
}

/** 供协议模块注入的运行环境：http / storage / env */
function makeCtx(settings: SGCCSettings) {
  return {
    env: {
      SGCC_SMS: (settings.smsCode || '').trim(),
    },
    storage: {
      getJSON: (k: string) => {
        try {
          const s = readCache(`sgcc_${k}.json`)
          return s ? JSON.parse(s) : null
        } catch {
          return null
        }
      },
      setJSON: (k: string, v: unknown) => {
        try {
          writeCache(`sgcc_${k}.json`, JSON.stringify(v))
        } catch {
          // 存储异常不阻断取数
        }
      },
    },
    http: {
      post: async (
        url: string,
        req: { headers?: Record<string, unknown>; body?: unknown; timeout?: number },
      ) => {
        // fetch 的 headers 要求所有 value 均为 string，null/undefined 需转空串
        const headers: Record<string, string> = {}
        for (const [hk, hv] of Object.entries(req.headers || {})) {
          headers[hk] = hv == null ? '' : String(hv)
        }
        const r = await fetch(url, {
          method: 'POST',
          headers,
          body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? ''),
          timeout: Math.ceil((req.timeout ?? 20000) / 1000),
        })
        const text = await r.text()
        return { status: r.status, text: async () => text }
      },
    },
  }
}

/** 清洗手机号：去掉 +86 前缀与非数字字符 */
function cleanPhone(raw: string | undefined): string {
  return (raw || '').trim().replace(/^(\+?86)?\s*/, '').replace(/\D/g, '')
}

/** 校验账号配置并创建官方接口会话 */
async function createApp(settings: SGCCSettings) {
  const phone = cleanPhone(settings.phone)
  const password = (settings.password || '').trim()
  if (!phone || !password) {
    throw new Error('未配置账号：请在设置页「国网 App 官方接口」填写手机号和登录密码并保存')
  }
  return new SgApp(makeCtx(settings), phone, password)
}

/** 在线拉取全部户的原始数据（官方直连），返回结构与旧 wsgw 接口一致 */
async function requestOnce(settings: SGCCSettings): Promise<RawAccount[]> {
  const app = await createApp(settings)
  const s = await app.ensure()
  const accts = ((s && s.accounts) || []) as SgAcct[]
  if (!accts.length) throw new Error('国网账号未绑定任何户号')

  const out: RawAccount[] = []
  let lastError: unknown = null
  for (const a of accts.slice(0, 6)) {
    try {
      out.push(await queryAccount(app, a))
    } catch (e) {
      // 部分户查询失败不致命，全部失败才抛出
      lastError = e
    }
  }
  if (!out.length) {
    throw lastError instanceof Error ? lastError : new Error('国网户号数据查询失败')
  }
  return out
}

/** 读取缓存中的账户数组，坏数据返回 null */
function readCachedAccounts(): RawAccount[] | null {
  const cached = readCache(CACHE_KEY)
  if (!cached) return null
  try {
    const parsed = JSON.parse(cached)
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as RawAccount[]
  } catch {
    console.error('缓存解析失败')
  }
  return null
}

/** 拉取账户数组：优先新鲜缓存 → 在线请求（重试）→ 过期缓存 */
async function fetchAccounts(
  settings: SGCCSettings,
): Promise<{ accounts: RawAccount[]; fromCache: boolean; age: number }> {
  const age = cacheAgeMinutes(CACHE_KEY)
  const cached = readCachedAccounts()

  // 缓存仍在有效期内，直接用
  if (cached && age >= 0 && age < settings.interval) {
    console.log(`使用缓存（${age} 分钟前）`)
    return { accounts: cached, fromCache: true, age }
  }

  // 在线请求
  let lastError: unknown = null
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const accounts = await requestOnce(settings)
      writeCache(CACHE_KEY, JSON.stringify(accounts))
      console.log('在线请求成功')
      return { accounts, fromCache: false, age: 0 }
    } catch (e) {
      lastError = e
      console.log(`请求失败（第 ${attempt + 1} 次）：${e}`)
    }
  }

  // 全部失败，退回过期缓存
  if (cached) {
    console.log('请求失败，使用过期缓存')
    return { accounts: cached, fromCache: true, age }
  }

  throw new Error(`无法获取数据：${lastError instanceof Error ? lastError.message : lastError}`)
}

/** 获取指定账户的视图模型。默认用 settings.accountIndex，传 accountIndex 可在多户场覆盖 */
export async function getBillData(
  settings: SGCCSettings,
  accountIndex?: number,
): Promise<BillViewModel> {
  const { accounts, fromCache, age } = await fetchAccounts(settings)

  const index = Math.min(Math.max(accountIndex ?? settings.accountIndex, 0), accounts.length - 1)
  const account = accounts[index]
  if (!account) throw new Error(`账户下标 ${index} 不存在`)

  const update = account.eleBill?.date || nowString()
  return buildViewModel(account, {
    update,
    fromCache,
    cacheAgeMinutes: age,
    stepMode: settings.stepMode,
    step2: settings.step2,
    step3: settings.step3,
    stepPercentMode: settings.stepPercentMode,
  })
}

/**
 * 列出所有账户，供设置页选择。
 * 只做登录会话（ensure），不逐户拉账单，比全量取数快得多。
 */
export async function listAccounts(
  settings: SGCCSettings,
): Promise<Array<{ index: number; consNo: string; consName: string }>> {
  const app = await createApp(settings)
  const s = await app.ensure()
  const accts = ((s && s.accounts) || []) as Array<{ consNo?: string; name?: string }>
  return accts.map((a, index) => ({
    index,
    consNo: a.consNo ?? '',
    consName: a.name || `账户 ${index + 1}`,
  }))
}

/**
 * 国网新设备验证：触发下发短信验证码到登录手机。
 * 成功后返回脱敏手机号；验证码收到后填入设置并保存、重新获取数据。
 */
export async function sendSmsCode(settings: SGCCSettings): Promise<string> {
  const app: any = await createApp(settings)
  const codeKey = await app.sendDeviceSms()
  app.st(app.sk(K.sms), { user: app.user, codeKey, ts: Date.now(), used: '' })
  const phone = String(app.user || '')
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`
}

export { SgError, CACHE_KEY }
