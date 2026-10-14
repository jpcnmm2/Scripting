/**
 * SGCC 国家电网电量小组件 —— 设置页（Scripting 移植版）。
 *
 * 移植（Scripting 版）：SylvanRoe · telegram: @Air_QT
 *维护：jpcnmm · telegram: @jpcnmm

 *
 * 原作者（原 Scriptable 脚本）声明：
 * @author: 脑瓜
 * @feedback: https://t.me/Scriptable_CN
 * telegram: @anker1209
 * version: 2.3.3
 * update: 2026/08/11
 * 原创UI，修改套用请注明来源
 * 数据接口：网上国网 App 3.2.3 官方直连（SM2/SM3/SM4 + Turing 设备令牌），
 * 移植自 Scriptable SGCC.js v2.3.4，无需 wsgw 重写与代理工具。
 */
import {
  Script,
  Navigation,
  NavigationStack,
  List,
  Section,
  Text,
  Button,
  Toggle,
  Picker,
  TextField,
  ColorPicker,
  SecureField,
  HStack,
  Spacer,
  Image,
  Widget,
  useState,
  useObservable,
  NavigationDestination,
  type Color,
} from 'scripting'
import { loadSettings, saveSettings, resetSettings } from './lib/store'
import { listAccounts, sendSmsCode } from './lib/api'
import { clearCache } from './lib/cache'
import { DEFAULT_SETTINGS, type SGCCSettings, type MetricKey, type RowDisplayMode } from './lib/types'

type Account = { index: number; consNo: string; consName: string }

type PatchFn = <K extends keyof SGCCSettings>(key: K, value: SGCCSettings[K]) => void

/** 行显示模式选项 */
const ROW_MODES = [
  { tag: 0, value: 'group1' as const, label: '组合一' },
  { tag: 1, value: 'group2' as const, label: '组合二' },
  { tag: 2, value: 'group3' as const, label: '组合三' },
  { tag: 3, value: 'step' as const, label: '阶梯电量' },
]

/** 指标项选项 */
const METRIC_OPTIONS = [
  { tag: 0, value: 'monthFee' as const, label: '上期电费' },
  { tag: 1, value: 'monthUsage' as const, label: '上月电量' },
  { tag: 2, value: 'yearFee' as const, label: '年度电费' },
  { tag: 3, value: 'yearUsage' as const, label: '年度电量' },
  { tag: 4, value: 'currentMonthEle' as const, label: '本月电量' },
  { tag: 5, value: 'dayFee' as const, label: '近日用电' },
  { tag: 6, value: 'remainFee' as const, label: '电费余额' },
  { tag: 7, value: 'dayChart' as const, label: '日用电图表' },
  { tag: 8, value: 'none' as const, label: '不显示' },
]

const rowModeTag = (mode: RowDisplayMode) => ROW_MODES.find(r => r.value === mode)?.tag ?? 0
const metricKeyTag = (key: MetricKey) => METRIC_OPTIONS.find(m => m.value === key)?.tag ?? 0

/** 渲染三栏模式选择器（第一栏/第二栏/第三栏），排列在上方 */
function rowModePickers(settings: SGCCSettings, patch: PatchFn): JSX.Element[] {
  const rows: Array<{ rowNum: 1 | 2 | 3; label: string }> = [
    { rowNum: 1, label: '第一栏' },
    { rowNum: 2, label: '第二栏' },
    { rowNum: 3, label: '第三栏' },
  ]
  return rows.map(({ rowNum, label }) => {
    const displayKey = rowNum === 1 ? 'row1Display' : rowNum === 2 ? 'row2Display' : 'row3Display'
    const mode = settings[displayKey]
    return (
      <Picker
        key={`row${rowNum}-mode`}
        title={label}
        value={rowModeTag(mode)}
        onChanged={(v: number) => {
          const m = ROW_MODES.find(r => r.tag === v)
          if (m) patch(displayKey, m.value)
        }}
        pickerStyle="menu"
      >
        {ROW_MODES.map(r => (
          <Text key={r.tag} tag={r.tag}>{r.label}</Text>
        ))}
      </Picker>
    )
  })
}

/** 渲染三组合内容选择器（组合一/二/三 的左栏+右栏），排列在下方 */
function groupContentPickers(settings: SGCCSettings, patch: PatchFn): JSX.Element[] {
  const groups: Array<{ gn: 1 | 2 | 3; label: string }> = [
    { gn: 1, label: '组合一' },
    { gn: 2, label: '组合二' },
    { gn: 3, label: '组合三' },
  ]
  const items: JSX.Element[] = []
  for (const { gn, label } of groups) {
    const leftKey = `group${gn}Left` as 'group1Left' | 'group2Left' | 'group3Left'
    const rightKey = `group${gn}Right` as 'group1Right' | 'group2Right' | 'group3Right'
    items.push(
      <Picker
        key={`group${gn}-left`}
        title={`${label} · 左栏`}
        value={metricKeyTag(settings[leftKey])}
        onChanged={(v: number) => {
          const m = METRIC_OPTIONS.find(o => o.tag === v)
          if (m) patch(leftKey, m.value)
        }}
        pickerStyle="menu"
      >
        {METRIC_OPTIONS.map(o => (
          <Text key={o.tag} tag={o.tag}>{o.label}</Text>
        ))}
      </Picker>,
      <Picker
        key={`group${gn}-right`}
        title={`${label} · 右栏`}
        value={metricKeyTag(settings[rightKey])}
        onChanged={(v: number) => {
          const m = METRIC_OPTIONS.find(o => o.tag === v)
          if (m) patch(rightKey, m.value)
        }}
        pickerStyle="menu"
      >
        {METRIC_OPTIONS.map(o => (
          <Text key={o.tag} tag={o.tag}>{o.label}</Text>
        ))}
      </Picker>,
    )
  }
  return items
}

interface DisplaySettingsProps {
  settings: SGCCSettings
  patch: PatchFn
  save: () => void
}

/** 二级页：显示样式 / 三栏内容 / 阶梯 集中配置 */
function DisplaySettingsView({ settings, patch, save }: DisplaySettingsProps) {
  return (
    <List
      navigationTitle="显示设置"
      navigationBarTitleDisplayMode="inline"
      toolbar={{
        confirmationAction: <Button title="保存" action={save} />,
      }}
    >
      <Section
        header={<Text>显示</Text>}
        footer={<Text font="caption">柱状图展示最近若干天的用电量。「柱状图显示度数」仅适用于 7 天及以下，启用后在柱顶标注度数。右侧三栏的显示模式和组合内容请在下方「三栏模式」和「组合内容」中配置。改动后请点右上角「保存」生效。</Text>}
      >
        <Picker
          title="国网 Logo 尺寸"
          value={settings.logoSize}
          onChanged={(v: number) => patch('logoSize', v)}
          pickerStyle="menu"
        >
          {[40, 42, 44, 46, 48, 50, 52, 54, 56].map(n => (
            <Text key={String(n)} tag={n}>
              {`${n}`}
            </Text>
          ))}
        </Picker>
        <Toggle
          title="显示户名"
          value={settings.showConsName}
          onChanged={v => patch('showConsName', v)}
        />
        <Toggle
          title="左栏显示余额"
          value={settings.showBalanceForPostPaid}
          onChanged={v => patch('showBalanceForPostPaid', v)}
        />
        <Toggle
          title="柱状图显示度数（≤7天）"
          value={settings.showChartValues}
          onChanged={v => patch('showChartValues', v)}
        />
        <Picker
          title="柱状图天数"
          value={settings.dayAmount}
          onChanged={(v: number) => patch('dayAmount', v)}
          pickerStyle="menu"
        >
          {[5, 6, 7, 8, 9, 10, 11, 12, 14].map(n => (
            <Text key={String(n)} tag={n}>
              {`${n} 天`}
            </Text>
          ))}
        </Picker>
        <Picker
          title="近日用电小数位"
          value={settings.dayFeeDecimals}
          onChanged={(v: number) => patch('dayFeeDecimals', v)}
          pickerStyle="menu"
        >
          {[0, 1, 2].map(n => (
            <Text key={String(n)} tag={n}>
              {n === 0 ? '整数' : `${n} 位`}
            </Text>
          ))}
        </Picker>
        <HStack>
          <Text>阶梯口径</Text>
          <Spacer />
          <Text foregroundStyle="secondaryLabel">按年累计</Text>
        </HStack>
        <ColorPicker
          title="柱状图颜色"
          value={settings.chartColor as Color}
          onChanged={v => patch('chartColor', v as string)}
          supportsOpacity={false}
        />
        <ColorPicker
          title="主题色"
          value={settings.accentColor as Color}
          onChanged={v => patch('accentColor', v as string)}
          supportsOpacity={false}
        />
      </Section>

      <Section
        header={<Text>三栏模式</Text>}
        footer={<Text font="caption">第一栏/第二栏/第三栏分别选择显示「组合一/二/三」或「阶梯电量」。改动后请点右上角「保存」生效。</Text>}
      >
        {rowModePickers(settings, patch)}
      </Section>

      <Section
        header={<Text>组合内容</Text>}
        footer={<Text font="caption">为组合一/二/三分别配置左栏和右栏的显示内容。当某栏选择了对应组合时，将使用这里的配置。改动后请点右上角「保存」生效。</Text>}
      >
        {groupContentPickers(settings, patch)}
      </Section>

      <Section
        header={<Text>阶梯电量</Text>}
        footer={
          <Text font="caption">
            按你的实际电表档位填写，单位度。留空表示按山东口径自动（按年累计 2520/4800 度）。「阶梯百分比」选择计算方式：全量 = 占第三档上限的比例（与横条滑块同轴），阶梯 = 当前阶梯内的进度。改动后请点右上角「保存」生效。
          </Text>
        }
      >
        <TextField
          title="第二档阈值（度）"
          prompt="0 = 自动"
          value={settings.step2 > 0 ? String(settings.step2) : ''}
          onChanged={v => patch('step2', parseInt(v, 10) || 0)}
        />
        <TextField
          title="第三档阈值（度）"
          prompt="0 = 自动"
          value={settings.step3 > 0 ? String(settings.step3) : ''}
          onChanged={v => patch('step3', parseInt(v, 10) || 0)}
        />
        <Picker
          title="阶梯百分比"
          value={settings.stepPercentMode}
          onChanged={(v: string) => patch('stepPercentMode', v as '全量' | '阶梯')}
          pickerStyle="menu"
        >
          <Text tag="全量">全量（占第三档比例）</Text>
          <Text tag="阶梯">阶梯（当前阶梯进度）</Text>
        </Picker>
        <Picker
          title="进度条样式"
          value={settings.stepBarStyle}
          onChanged={(v: string) => patch('stepBarStyle', v as '三色' | '纯色')}
          pickerStyle="menu"
        >
          <Text tag="三色">三色（渐变过渡）</Text>
          <Text tag="纯色">纯色（原始单色）</Text>
        </Picker>
      </Section>
    </List>
  )
}

interface MultiConfigProps {
  settings: SGCCSettings
  patchAccName: (index: number, value: string) => void
  save: () => void
}

/** 二级页：多户配置（户 1/2/3 自定义名称） */
function MultiConfigView({ settings, patchAccName, save }: MultiConfigProps) {
  return (
    <List
      navigationTitle="多户配置"
      navigationBarTitleDisplayMode="inline"
      toolbar={{
        confirmationAction: <Button title="保存" action={save} />,
      }}
    >
      <Section
        header={<Text>多户配置</Text>}
        footer={
          <Text font="caption">
            给每个账户起个能区分的名字。桌面上放多个小组件时，在每个小组件的「参数」里填对应的户名（或 1/2/3），该小组件就会固定显示这一户。以下「户 1/2/3」按「当前账户」列表的顺序对应。改完记得点右上角「保存」。
          </Text>
        }
      >
        {[0, 1, 2].map(i => (
          <TextField
            key={i}
            title={`户 ${i + 1} 名称`}
            prompt="留空显示实际户名"
            value={settings.accNames[i] ?? ''}
            onChanged={v => patchAccName(i, v)}
          />
        ))}
      </Section>
    </List>
  )
}

function SettingsView() {
  const dismiss = Navigation.useDismiss()
  const [settings, setSettings] = useState<SGCCSettings>(loadSettings)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  // 二级页面推送栈：空=根页，['display']=显示设置页
  const path = useObservable<string[]>([])

  const patch = <K extends keyof SGCCSettings>(key: K, value: SGCCSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  const patchAccName = (index: number, value: string) => {
    setSettings(prev => {
      const accNames = [...(prev.accNames ?? [])]
      accNames[index] = value
      return { ...prev, accNames }
    })
  }

  // 显式保存：改动先在本地状态里，点右上角「保存」后落盘，小组件下次刷新才读到新配置
  const save = () => {
    saveSettings(settings)
    setStatus('已保存')
  }

  const loadAccountList = async () => {
    if (loading) return
    setLoading(true)
    setStatus('正在登录国网获取账户…')
    try {
      const list = await listAccounts(loadSettings())
      setAccounts(list)
      setStatus(`已获取 ${list.length} 个账户`)
    } catch (e) {
      setStatus(`获取失败：${e instanceof Error ? e.message : e}`)
    } finally {
      setLoading(false)
    }
  }

  // 触发国网下发新设备验证短信。用当前界面上的手机号/密码（不必先保存）
  const sendSms = async () => {
    if (loading) return
    setLoading(true)
    setStatus('正在请求国网发送短信验证码…')
    try {
      const masked = await sendSmsCode(settings)
      setStatus(`验证码已发送至 ${masked}，收到后填入下方「短信验证码」并点右上角保存，再点「获取账户列表」`)
    } catch (e) {
      setStatus(`发送失败：${e instanceof Error ? e.message : e}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <NavigationStack path={path}>
      <List
        navigationTitle="国家电网"
        navigationBarTitleDisplayMode="inline"
        navigationDestination={
          <NavigationDestination>
            {(page: string) =>
              page === 'display' ? (
                <DisplaySettingsView settings={settings} patch={patch} save={save} />
              ) : page === 'names' ? (
                <MultiConfigView settings={settings} patchAccName={patchAccName} save={save} />
              ) : (
                <List navigationTitle="" />
              )
            }
          </NavigationDestination>
        }
        toolbar={{
          cancellationAction: <Button title="关闭" action={dismiss} />,
          confirmationAction: <Button title="保存" action={save} />,
        }}
      >
        <Section
          header={<Text>国网 App 官方接口</Text>}
          footer={
            <Text font="caption">
              直连国网 App 官方接口，无需代理重写。填写手机号与登录密码后点右上角「保存」，再点「获取账户列表」。首次登录新设备时国网会要求短信验证：点「发送短信验证码」，收到后填入验证码并保存，重新获取即可。账号仅保存在本机脚本私有存储。
            </Text>
          }
        >
          <TextField
            title="手机号"
            prompt="网上国网 App 登录手机号"
            value={settings.phone}
            onChanged={v => patch('phone', v)}
          />
          <SecureField
            title="登录密码"
            prompt="网上国网 App 登录密码"
            value={settings.password}
            onChanged={v => patch('password', v)}
          />
          <Button
            title={loading ? '发送中…' : '发送短信验证码'}
            action={sendSms}
            disabled={loading}
          />
          <TextField
            title="短信验证码"
            prompt="新设备验证时填入 6 位验证码"
            value={settings.smsCode}
            onChanged={v => patch('smsCode', v)}
          />
        </Section>

        <Section
          header={<Text>账户</Text>}
          footer={
            <Text font="caption">
              需先在上方「国网 App 官方接口」配置并保存账号，再点击「获取账户列表」。多户时选择要显示的账户。
            </Text>
          }
        >
          <Button
            title={loading ? '获取中…' : '获取账户列表'}
            action={loadAccountList}
            disabled={loading}
          />
          {accounts.length > 0 ? (
            <Picker
              title="当前账户"
              value={settings.accountIndex}
              onChanged={(v: number) => patch('accountIndex', v)}
              pickerStyle="menu"
            >
              {accounts.map(a => (
                <Text key={String(a.index)} tag={a.index}>
                  {a.consName || `账户 ${a.index + 1}`}
                </Text>
              ))}
            </Picker>
          ) : (
            <HStack>
              <Text>账户下标</Text>
              <Spacer />
              <Text foregroundStyle="secondaryLabel">{settings.accountIndex}</Text>
            </HStack>
          )}
          {status ? (
            <Text font="caption" foregroundStyle="secondaryLabel">
              {status}
            </Text>
          ) : null}
        </Section>

        <Section>
          <Button
            action={() => path.setValue(['names'])}
          >
            <HStack>
              <Image
                systemName="person.2"
                imageScale="medium"
                foregroundStyle={{ light: '#0DB38E', dark: '#6BE3C2' }}
                frame={{ width: 28, alignment: 'center' }}
              />
              <Text>多户配置</Text>
              <Spacer />
              <Image
                systemName="chevron.right"
                imageScale="small"
                foregroundStyle={{ light: '#8E8E93', dark: '#48484A' }}
              />
            </HStack>
          </Button>
        </Section>

        <Section>
          <Button
            action={() => path.setValue(['display'])}
          >
            <HStack>
              <Image
                systemName="slider.horizontal.3"
                imageScale="medium"
                foregroundStyle={{ light: '#0DB38E', dark: '#6BE3C2' }}
                frame={{ width: 28, alignment: 'center' }}
              />
              <Text>显示设置</Text>
              <Spacer />
              <Image
                systemName="chevron.right"
                imageScale="small"
                foregroundStyle={{ light: '#8E8E93', dark: '#48484A' }}
              />
            </HStack>
          </Button>
        </Section>

        <Section
          header={<Text>数据</Text>}
          footer={
            <Text font="caption">
              刷新间隔越短越耗流量。数据来自国网 App 官方直连接口。「清除缓存」会同时清空登录会话，下次刷新需重新登录。
            </Text>
          }
        >
          <Picker
            title="刷新间隔"
            value={settings.interval}
            onChanged={(v: number) => patch('interval', v)}
            pickerStyle="menu"
          >
            {[240, 360, 480, 720, 1440].map(n => (
              <Text key={String(n)} tag={n}>
                {`${n / 60} 小时`}
              </Text>
            ))}
          </Picker>
          <Button
            title="清除缓存"
            role="destructive"
            action={() => {
              clearCache()
              setStatus('缓存已清除')
            }}
          />
        </Section>

        <Section
          header={<Text>预览</Text>}
          footer={
            <Text font="caption">
              预览页顶部可切换参数：「真实数据」走接口（读取的是已保存的设置，改动后请先点「保存」），「演示数据」不联网、用于校对布局。
            </Text>
          }
        >
          <Button
            title="预览中号小组件"
            action={async () => {
              await Widget.preview<'真实数据' | '演示数据'>({
                family: 'systemMedium',
                parameters: {
                  options: {
                    '真实数据': '',
                    '演示数据': 'demo',
                  },
                  default: '真实数据',
                },
              })
            }}
          />
        </Section>

        <Section>
          <Button
            title="恢复默认设置"
            role="destructive"
            action={() => {
              resetSettings()
              setSettings({ ...DEFAULT_SETTINGS })
              setStatus('已恢复默认设置')
            }}
          />
        </Section>
      </List>
    </NavigationStack>
  )
}

async function run() {
  await Navigation.present(<SettingsView />)
  Script.exit()
}

run()
