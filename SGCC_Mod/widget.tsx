/**
 * SGCC 国家电网电量小组件 —— Scripting 移植版。
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
 * 使用该脚本需DmYY依赖及添加重写，重写修改自作者@Yuheng0101
 * 重写: https://raw.githubusercontent.com/dompling/Script/master/wsgw/index.js
 * 依赖: https://raw.githubusercontent.com/dompling/Scriptable/master/Scripts/DmYY.js
 *
 * 附：原脚本头部（Scriptable 专用，Scripting 中不生效，仅留档）——
 *   // Variables used by Scriptable.
 *   // These must be at the very top of the file. Do not edit.
 *   // icon-color: teal; icon-glyph: project-diagram;
 *
 * 免责声明：
 *   1. 本仓库中涉及任何解锁和解密分析的脚本仅用于资源共享和学习研究，不能保证其合法性、准确性、完整性和有效性，请根据情况自行判断。
 *   2. 本仓库内的任何内容禁止在中华人民共和国境内平台公开传播。
 *   3. 请勿将本仓库内的任何内容用于商业或非法目的，否则后果自负。
 *   4. 如果任何单位或个人认为该项目的脚本可能涉嫌侵犯其权利，则应及时通知并提供身份证明、所有权证明，我将在收到认证文件后删除相关脚本。
 *   5. 对任何本仓库中包含的脚本在使用中可能出现的问题概不负责，包括但不限于由任何脚本错误导致的任何损失或损害。
 *   6. 您必须在下载后的24小时内从计算机或手机中完全删除以上内容。
 *   7. 以任何方式查看此项目的人或直接或间接使用该项目的任何脚本的使用者都应仔细阅读此声明。保留随时更改或补充此免责声明的权利。一旦使用并复制了任何本仓库相关脚本或其他内容，则视为您已接受此免责声明。
 *
 * 补充说明：
 *   本仓库内的脚本不允许商业用途，但可以用于学习和研究，转载请保留原作者署名。
 */
import {
  Widget,
  VStack,
  HStack,
  ZStack,
  Text,
  Image,
  Spacer,
  Rectangle,
  UnevenRoundedRectangle,
  Circle,
  type DynamicShapeStyle,
  type ShapeStyle,
} from 'scripting'
import { getBillData } from './lib/api'
import { loadSettings } from './lib/store'
import {
  recentDays,
  describeCacheAge,
  shortTime,
  resolveAccountIndex,
} from './lib/calc'
import type { BillViewModel, SGCCSettings, MetricKey, RowDisplayMode } from './lib/types'

const settings = loadSettings()

/** 深浅色自适应 */
const bg: DynamicShapeStyle = { light: '#F2F2F7', dark: '#1C1C1E' }
const panelBg: DynamicShapeStyle = { light: '#E2E2E7', dark: '#2C2C2F' }
const labelColor: DynamicShapeStyle = { light: '#6E6E73', dark: '#98989F' }
const valueColor: DynamicShapeStyle = { light: '#1C1C1E', dark: '#F2F2F7' }
const dividerColor: DynamicShapeStyle = { light: '#00000014', dark: '#FFFFFF14' }
const sepGray: DynamicShapeStyle = { light: 'rgba(120,120,120,0.35)', dark: 'rgba(180,180,180,0.28)' }
const overdueColor: ShapeStyle = '#DE2A18'
// 弱化红色：用于超出百分比和度数数字，比 overdueColor 更柔和
const exceedTextColor: ShapeStyle = '#C85650'

const chartColor = settings.chartColor as ShapeStyle
const accentColor = settings.accentColor as ShapeStyle

/** 国网 logo 图源（参照原脚本 getLogo 默认图源） */
const LOGO_URL = 'https://raw.githubusercontent.com/anker1209/icon/main/gjdw.png'

/** 组件实际宽度（根据设备自适应） */
const WIDGET_WIDTH = Widget.displaySize?.width ?? 329
/** 左侧面板宽度 */
const PANEL_WIDTH = 124
/** 右面板左右内边距合计 */
const RIGHT_PADDING = 30
/** 右面板内可用宽度 */
const RIGHT_INNER = WIDGET_WIDTH - PANEL_WIDTH - RIGHT_PADDING
/** 阶梯条宽度 = 右面板内可用宽度 */
const BAR_WIDTH = RIGHT_INNER

/** 把 #rrggbb 颜色向白色混合 amount（0~1），返回更浅的 6 位 hex */
function lightenHex(hex: string, amount: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex
  const c = (i: number) => parseInt(hex.slice(i + 1, i + 3), 16)
  const mix = (v: number) => Math.round(v + (255 - v) * amount)
  const to2 = (v: number) => v.toString(16).padStart(2, '0')
  return `#${to2(mix(c(0)))}${to2(mix(c(2)))}${to2(mix(c(4)))}`
}

// 阶梯条配色：三组颜色，对应三个区域
// 区域1：0→step2（第一阶梯），区域2：step2→step3（第二阶梯），区域3：超出step3（第三阶梯+超出段）
const chartHex = settings.chartColor
// 色调混合：将 hex 颜色向目标色混合指定比例
function blendHex(hex: string, target: string, ratio: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex) || !/^#[0-9a-fA-F]{6}$/.test(target)) return hex
  const c = (s: string, i: number) => parseInt(s.slice(i + 1, i + 3), 16)
  const mix = (a: number, b: number) => Math.round(a + (b - a) * ratio)
  const to2 = (v: number) => v.toString(16).padStart(2, '0')
  return `#${to2(mix(c(hex, 0), c(target, 0)))}${to2(mix(c(hex, 2), c(target, 2)))}${to2(mix(c(hex, 4), c(target, 4)))}`
}
// 三组颜色：绿→黄→橙，纯色不混合基色，颜色鲜明
const zone1Color = '#34C759' as ShapeStyle  // 区域1（第一阶梯，绿色）
const zone2Color = '#D4A800' as ShapeStyle  // 区域2（第二阶梯，暗黄色）
const zone3Color = '#CC6600' as ShapeStyle  // 区域3（第三阶梯+超出，暗橙色）
// 各区域剩余段（浅色底槽）
const zone1Remain = lightenHex(chartHex, 0.6) as ShapeStyle
const zone2Remain = lightenHex(zone2Color as string, 0.6) as ShapeStyle
const zone3Remain = lightenHex(zone3Color as string, 0.6) as ShapeStyle

/** 数值 + 单位的一组展示 */
function Metric({
  label,
  value,
  unit,
  align = 'leading',
  highlight = false,
}: {
  label: string
  value: string
  unit: string
  align?: 'leading' | 'trailing'
  highlight?: boolean
}) {
  return (
    <VStack alignment={align} spacing={1}>
      <Text font={11} fontWeight="semibold" foregroundStyle={labelColor}>
        {label}
      </Text>
      <HStack alignment="firstTextBaseline" spacing={1.5}>
        <Text
          font={17}
          fontWeight="medium"
          fontDesign="rounded"
          foregroundStyle={highlight ? overdueColor : valueColor}
        >
          {value}
        </Text>
        <Text font={9} fontWeight="semibold" foregroundStyle={labelColor}>
          {unit}
        </Text>
      </HStack>
    </VStack>
  )
}

/** 近日用电柱状图（参照原 Scriptable 脚本 chartBar 方法）
 *  原脚本画布参数：柱宽 8、间距 10、高 50、圆角 4，经 scale≈0.63 缩放后
 *  → 柱宽 ≈5pt、间距 ≈6pt、高 ≈31pt、圆角 ≈2pt
 *  柱子间距固定不变，图表宽度 = n×5 + (n-1)×6，随选择天数自然增长
 *  桌面组件不执行 VStack/ZStack 的 frame width，但执行 Rectangle 的 frame width
 *  和 HStack spacing，因此实际宽度由柱宽 + 固定间距撑开 */
const BAR_W = 5        // 单根柱子宽度（pt）
const BAR_GAP = 6     // 柱子间距（pt），固定不变
const CHART_H = 31    // 柱状图最大高度（pt），对应原脚本 50×0.63
const CORNER_R = 2    // 圆角半径 = BAR_W / 2

/** 柱状图盒子高度：与同栏另一侧的 Metric/DayFeeMetric 文字标签顶部齐平 */
const CHART_BOX_HEIGHT = 34
/** 近日用电数值 font 20 的近似 descent，用于把柱状图底边抬到字形底边 */
const BASELINE_DESCENT = 4
/** 显示度数时的数值标签字号 */
const VALUE_FONT = 10
/** 显示度数时数值标签与柱顶的间距 */
const VALUE_GAP = 1

function DayChart({ data }: { data: BillViewModel['dayElePq'] }) {
  const bars = recentDays(data, settings.dayAmount)
  const n = bars.length
  // 是否在柱顶标注度数：需开启且天数 ≤ 7
  const showValues = settings.showChartValues && n <= 7
  // 间距：显示度数时柱子被 VStack 居中，实际视觉间距变大，适当减小
  const gap = showValues ? 3 : BAR_GAP
  // 显示度数时每项宽度需容纳两位数标签，否则会被截断
  const VALUE_W = 16
  const itemW = showValues ? Math.max(BAR_W, VALUE_W) : BAR_W
  // 图表自然宽度 = n 项 + (n-1) 个间距
  const chartWidth = n * itemW + (n - 1) * gap
  if (n === 0) {
    return (
      <Text font={11} fontWeight="semibold" foregroundStyle={labelColor} frame={{ width: chartWidth }}>
        暂无用电数据
      </Text>
    )
  }

  const max = Math.max(...bars.map(b => b.elePq), 0.01)
  // 显示度数时盒子高度增加，容纳柱顶标签
  const boxHeight = showValues ? CHART_BOX_HEIGHT + VALUE_FONT + VALUE_GAP : CHART_BOX_HEIGHT

  return (
    <ZStack
      alignment="bottomLeading"
      frame={{ width: chartWidth, height: boxHeight }}
      offset={{ x: 0, y: -BASELINE_DESCENT }}
    >
      <HStack alignment="bottom" spacing={gap}>
        {bars.map(item => {
          const ratio = item.elePq / max
          // 最小高度 2pt，保证零值也可见
          const h = Math.max(ratio * CHART_H, 2)
          return (
            <VStack key={item.label} alignment="center" spacing={VALUE_GAP}>
              {showValues ? (
                <Text font={VALUE_FONT} fontWeight="semibold" foregroundStyle={labelColor} frame={{ width: VALUE_W }}>
                  {Math.round(item.elePq)}
                </Text>
              ) : null}
              <Rectangle
                fill={chartColor}
                frame={{ width: BAR_W, height: h }}
                clipShape={{ type: 'rect', cornerRadius: CORNER_R }}
              />
            </VStack>
          )
        })}
      </HStack>
    </ZStack>
  )
}

/**
 * 阶梯用电可视化：
 * - 横向长条：深绿已用 + 浅绿总范围
 * - 垂直刻度竖线把条分成 3 段电价区间
 * - 圆形滑块定位当前用电位置
 * - 上方文字标注 "阶梯电量" + "第N阶梯·xx%"
 */
function StepRow({ step, yearUsage, barStyle }: { step: BillViewModel['step']; yearUsage: number; barStyle: '三色' | '纯色' }) {
  const { step2, step3, isOverLimit, maxScale } = step

  const BAR_HEIGHT = 8
  const TICK_WIDTH = 2
  const TICK_HEIGHT = 12
  const SLIDER_SIZE = 12

  // 进度条缩放上限：不超出时=step3，超出时=usage（动态扩展）
  const scale = maxScale

  // 各段宽度
  const seg1W = (step2 / scale) * BAR_WIDTH   // 第一档段宽
  const seg2W = ((step3 - step2) / scale) * BAR_WIDTH  // 第二档段宽
  const seg3W = ((step3 - 0) / scale) * BAR_WIDTH - seg1W - seg2W // 第三档段宽（不超出时到 BAR_WIDTH）
  const exceedW = isOverLimit ? ((step.usage - step3) / scale) * BAR_WIDTH : 0 // 超出段宽

  // 已用比例
  const usageRatio = Math.max(0, Math.min(step.usage / scale, 1))
  const usedWidth = Math.max(usageRatio * BAR_WIDTH, 2)

  // 刻度竖线 X 位置
  const tick2X = (step2 / scale) * BAR_WIDTH
  const tick3X = (step3 / scale) * BAR_WIDTH

  // 滑块 X
  const sliderX = Math.max(
    0,
    Math.min(BAR_WIDTH - SLIDER_SIZE, usedWidth - SLIDER_SIZE / 2),
  )

  const tierText = ['一', '二', '三'][step.level - 1]
  const overColor: ShapeStyle = exceedTextColor

  return (
    <VStack alignment="leading" spacing={2}>
      {/* 上方文字标注：左=当前阶梯+百分比，右=剩余/超出度数 */}
      <HStack alignment="firstTextBaseline">
        {isOverLimit ? (
          <HStack alignment="firstTextBaseline" spacing={0}>
            <Text font={11} fontWeight="semibold" foregroundStyle={labelColor}>
              第三阶梯·
            </Text>
            <Text font={11} fontWeight="semibold" foregroundStyle={overColor}>
              {`${step.exceedPercent.toFixed(1)}%`}
            </Text>
          </HStack>
        ) : (
          <Text font={11} fontWeight="semibold" foregroundStyle={labelColor}>
            {`第${tierText}阶梯·${step.percent.toFixed(2)}%`}
          </Text>
        )}
        <Spacer />
        {isOverLimit ? (
          <HStack alignment="firstTextBaseline" spacing={2}>
            <Text font={11} fontWeight="semibold" foregroundStyle={labelColor}>
              超出
            </Text>
            <Text font={11} fontWeight="semibold" foregroundStyle={overColor}>
              {step.exceed.toFixed(0)}
            </Text>
            <Text font={11} fontWeight="semibold" foregroundStyle={labelColor}>
              度
            </Text>
          </HStack>
        ) : (
          <Text font={11} fontWeight="semibold" foregroundStyle={labelColor}>
            {`剩余 ${step.remain.toFixed(0)} 度`}
          </Text>
        )}
      </HStack>

      {/* 横向阶梯条 */}
      {barStyle === '纯色' ? (
        // 纯色模式：原始单色进度条
        <ZStack alignment="leading">
          <Rectangle
            fill={lightenHex(chartHex, 0.55) as ShapeStyle}
            frame={{ width: BAR_WIDTH, height: BAR_HEIGHT }}
            clipShape={{ type: 'rect', cornerRadius: BAR_HEIGHT / 2 }}
            offset={{ x: 0, y: 0 }}
          />
          <Rectangle
            fill={chartHex as ShapeStyle}
            frame={{ width: usedWidth, height: BAR_HEIGHT }}
            clipShape={{ type: 'rect', cornerRadius: BAR_HEIGHT / 2 }}
            offset={{ x: 0, y: 0 }}
          />
          <Rectangle
            fill={lightenHex(chartHex, 0.32) as ShapeStyle}
            frame={{ width: TICK_WIDTH, height: TICK_HEIGHT }}
            clipShape={{ type: 'rect', cornerRadius: TICK_WIDTH / 2 }}
            offset={{ x: Math.max(0, tick2X - TICK_WIDTH / 2), y: (SLIDER_SIZE - TICK_HEIGHT) / 2 }}
          />
          <Rectangle
            fill={lightenHex(chartHex, 0.32) as ShapeStyle}
            frame={{ width: TICK_WIDTH, height: TICK_HEIGHT }}
            clipShape={{ type: 'rect', cornerRadius: TICK_WIDTH / 2 }}
            offset={{ x: Math.max(0, tick3X - TICK_WIDTH), y: (SLIDER_SIZE - TICK_HEIGHT) / 2 }}
          />
          <Circle
            fill={isOverLimit ? zone3Color : lightenHex(chartHex, 0.32) as ShapeStyle}
            frame={{ width: SLIDER_SIZE, height: SLIDER_SIZE }}
            offset={{ x: sliderX, y: 0 }}
          />
        </ZStack>
      ) : (
        // 三色模式：三段渐变色 + 已用覆盖 + 刻度 + 滑块
        <ZStack alignment="leading">
          {/* 底槽段1：第一档（左端圆角） */}
          <UnevenRoundedRectangle
            fill={zone1Remain}
            topLeadingRadius={BAR_HEIGHT / 2}
            bottomLeadingRadius={BAR_HEIGHT / 2}
            topTrailingRadius={0}
            bottomTrailingRadius={0}
            frame={{ width: seg1W, height: BAR_HEIGHT }}
            offset={{ x: 0, y: 0 }}
          />
          {/* 底槽段2：第二档 */}
          <Rectangle
            fill={zone2Remain}
            frame={{ width: seg2W, height: BAR_HEIGHT }}
            offset={{ x: seg1W, y: 0 }}
          />
          {/* 底槽段3：第三档（右端圆角，超出时不圆角由超出段处理） */}
          {isOverLimit ? (
            <Rectangle
              fill={zone3Remain}
              frame={{ width: seg3W, height: BAR_HEIGHT }}
              offset={{ x: seg1W + seg2W, y: 0 }}
            />
          ) : (
            <UnevenRoundedRectangle
              fill={zone3Remain}
              topLeadingRadius={0}
              bottomLeadingRadius={0}
              topTrailingRadius={BAR_HEIGHT / 2}
              bottomTrailingRadius={BAR_HEIGHT / 2}
              frame={{ width: seg3W, height: BAR_HEIGHT }}
              offset={{ x: seg1W + seg2W, y: 0 }}
            />
          )}
          {/* 超出段底槽（超出时才显示，右端圆角） */}
          {isOverLimit && (
            <UnevenRoundedRectangle
              fill={zone3Remain}
              topLeadingRadius={0}
              bottomLeadingRadius={0}
              topTrailingRadius={BAR_HEIGHT / 2}
              bottomTrailingRadius={BAR_HEIGHT / 2}
              frame={{ width: exceedW, height: BAR_HEIGHT }}
              offset={{ x: seg1W + seg2W + seg3W, y: 0 }}
            />
          )}
          {/* 已用段1：第一档已用（左端圆角） */}
          <UnevenRoundedRectangle
            fill={zone1Color}
            topLeadingRadius={BAR_HEIGHT / 2}
            bottomLeadingRadius={BAR_HEIGHT / 2}
            topTrailingRadius={0}
            bottomTrailingRadius={0}
            frame={{ width: Math.min(usedWidth, seg1W), height: BAR_HEIGHT }}
            offset={{ x: 0, y: 0 }}
          />
          {/* 已用段2：第二档已用 */}
          {usedWidth > seg1W && (
            <Rectangle
              fill={zone2Color}
              frame={{ width: Math.min(usedWidth - seg1W, seg2W), height: BAR_HEIGHT }}
              offset={{ x: seg1W, y: 0 }}
            />
          )}
          {/* 已用段3：第三档已用（不超出时右端圆角） */}
          {usedWidth > seg1W + seg2W && !isOverLimit && (
            <UnevenRoundedRectangle
              fill={zone3Color}
              topLeadingRadius={0}
              bottomLeadingRadius={0}
              topTrailingRadius={BAR_HEIGHT / 2}
              bottomTrailingRadius={BAR_HEIGHT / 2}
              frame={{ width: Math.min(usedWidth - seg1W - seg2W, seg3W), height: BAR_HEIGHT }}
              offset={{ x: seg1W + seg2W, y: 0 }}
            />
          )}
          {/* 已用段3：第三档已用（超出时直角） */}
          {usedWidth > seg1W + seg2W && isOverLimit && (
            <Rectangle
              fill={zone3Color}
              frame={{ width: Math.min(usedWidth - seg1W - seg2W, seg3W), height: BAR_HEIGHT }}
              offset={{ x: seg1W + seg2W, y: 0 }}
            />
          )}
          {/* 已用超出段（右端圆角） */}
          {isOverLimit && usedWidth > seg1W + seg2W + seg3W && (
            <UnevenRoundedRectangle
              fill={zone3Color}
              topLeadingRadius={0}
              bottomLeadingRadius={0}
              topTrailingRadius={BAR_HEIGHT / 2}
              bottomTrailingRadius={BAR_HEIGHT / 2}
              frame={{ width: Math.min(usedWidth - seg1W - seg2W - seg3W, exceedW), height: BAR_HEIGHT }}
              offset={{ x: seg1W + seg2W + seg3W, y: 0 }}
            />
          )}
          {/* 刻度 1：第二阶梯起点 */}
          <Rectangle
            fill={zone2Color}
            frame={{ width: TICK_WIDTH, height: TICK_HEIGHT }}
            clipShape={{ type: 'rect', cornerRadius: TICK_WIDTH / 2 }}
            offset={{ x: Math.max(0, tick2X - TICK_WIDTH / 2), y: (SLIDER_SIZE - TICK_HEIGHT) / 2 }}
          />
          {/* 刻度 2：第三阶梯起点 */}
          <Rectangle
            fill={zone3Color}
            frame={{ width: TICK_WIDTH, height: TICK_HEIGHT }}
            clipShape={{ type: 'rect', cornerRadius: TICK_WIDTH / 2 }}
            offset={{ x: Math.max(0, tick3X - TICK_WIDTH), y: (SLIDER_SIZE - TICK_HEIGHT) / 2 }}
          />
          {/* 圆形滑块 */}
          <Circle
            fill={isOverLimit ? zone3Color : step.level === 1 ? zone1Color : step.level === 2 ? zone2Color : zone3Color}
            frame={{ width: SLIDER_SIZE, height: SLIDER_SIZE }}
            offset={{ x: sliderX, y: 0 }}
          />
        </ZStack>
      )

      {/* 年度电量标注：位于滑块正下方，与滑块中心对齐，左右边缘限位防溢出 */}
      {(() => {
        const LABEL_W = 45
        const sliderCenter = sliderX + SLIDER_SIZE / 2
        let labelX = sliderCenter - LABEL_W / 2
        labelX = Math.max(0, Math.min(labelX, BAR_WIDTH - LABEL_W))
        return (
          <HStack
            spacing={1}
            alignment="firstTextBaseline"
            frame={{ width: LABEL_W, alignment: 'center' as const }}
            offset={{ x: labelX, y: -1 }}
          >
            <Text font={11} fontWeight="bold" foregroundStyle={labelColor}>
              {yearUsage.toFixed(0)}
            </Text>
            <Text font={11} fontWeight="regular" foregroundStyle={labelColor}>
              度
            </Text>
          </HStack>
        )
      })()}
    </VStack>
  )
}

/** 近日用电：大号数值 + 度，与柱状图并排时视觉醒目 */
function DayFeeMetric({ vm, settings, align = 'leading' }: { vm: BillViewModel; settings: SGCCSettings; align?: 'leading' | 'trailing' }) {
  return (
    <VStack alignment={align} spacing={1}>
      <Text font={11} fontWeight="semibold" foregroundStyle={labelColor} lineLimit={1}>
        近日用电
      </Text>
      <HStack alignment="firstTextBaseline" spacing={1}>
        <Text
          font={18}
          fontWeight="semibold"
          fontDesign="rounded"
          foregroundStyle={chartColor}
          lineLimit={1}
        >
          {vm.dayFee.toFixed(settings.dayFeeDecimals)}
        </Text>
        <Text font={10} fontWeight="semibold" foregroundStyle={labelColor}>
          度
        </Text>
      </HStack>
    </VStack>
  )
}

/** 按 MetricKey 渲染对应的内容块 */
function MetricItem({
  vm,
  settings,
  metricKey,
  align = 'leading',
}: {
  vm: BillViewModel
  settings: SGCCSettings
  metricKey: MetricKey
  align?: 'leading' | 'trailing'
}) {
  switch (metricKey) {
    case 'monthFee':
      return <Metric label="上期电费" value={vm.monthFee.toFixed(2)} unit="元" align={align} />
    case 'monthUsage':
      return <Metric label="上月电量" value={vm.monthUsage.toFixed(0)} unit="度" align={align} />
    case 'yearFee':
      return <Metric label="年度电费" value={vm.yearFee.toFixed(2)} unit="元" align={align} />
    case 'yearUsage':
      return <Metric label="年度电量" value={vm.yearUsage.toFixed(0)} unit="度" align={align} />
    case 'currentMonthEle':
      return <Metric label="本月电量" value={vm.currentMonthEle.toFixed(0)} unit="度" align={align} />
    case 'dayFee':
      return <DayFeeMetric vm={vm} settings={settings} align={align} />
    case 'remainFee':
      return (
        <Metric
          label="电费余额"
          value={Math.abs(vm.remainFee).toFixed(2)}
          unit="元"
          align={align}
          highlight={vm.isOverdue}
        />
      )
    case 'dayChart':
      return <DayChart data={vm.dayElePq} />
    case 'none':
      return null
  }
}

/** 组合行：双 VStack 自然宽度 + Spacer 撑两端，柱状图靠柱子宽度自然撑开 */
function GroupRow({
  vm,
  settings,
  groupNum,
}: {
  vm: BillViewModel
  settings: SGCCSettings
  groupNum: 1 | 2 | 3
}) {
  const leftKey: MetricKey =
    groupNum === 1 ? settings.group1Left : groupNum === 2 ? settings.group2Left : settings.group3Left
  const rightKey: MetricKey =
    groupNum === 1 ? settings.group1Right : groupNum === 2 ? settings.group2Right : settings.group3Right

  const hasChart = leftKey === 'dayChart' || rightKey === 'dayChart'

  // 两侧都不显示时返回 Spacer 保持布局
  if (leftKey === 'none' && rightKey === 'none') {
    return <Spacer />
  }

  return (
    <HStack alignment={hasChart ? 'bottom' : 'firstTextBaseline'} spacing={0} frame={{ maxWidth: 'infinity' }}>
      <VStack alignment="leading">
        <MetricItem vm={vm} settings={settings} metricKey={leftKey} />
      </VStack>
      <Spacer />
      <VStack alignment="trailing">
        <MetricItem vm={vm} settings={settings} metricKey={rightKey} align="trailing" />
      </VStack>
    </HStack>
  )
}

/** 按 rowNum 读取行模式，渲染对应的组合行或阶梯行 */
function RowRenderer({
  vm,
  settings,
  rowNum,
}: {
  vm: BillViewModel
  settings: SGCCSettings
  rowNum: 1 | 2 | 3
}) {
  const mode: RowDisplayMode =
    rowNum === 1 ? settings.row1Display : rowNum === 2 ? settings.row2Display : settings.row3Display

  if (mode === 'step') {
    return <StepRow step={vm.step} yearUsage={vm.yearUsage} barStyle={settings.stepBarStyle} />
  }

  const groupNum = mode === 'group1' ? 1 : mode === 'group2' ? 2 : 3
  return <GroupRow vm={vm} settings={settings} groupNum={groupNum} />
}

/** 左侧：户名 + 上期电费/账户余额（待缴时优先显示待缴电费） */
function LeftPanel({ vm, settings, logoImage }: { vm: BillViewModel; settings: SGCCSettings; logoImage?: UIImage | null }) {
  // 左栏金额显示逻辑：待缴优先 > 余额（开关开启时始终显示账户余额）> 上期电费
  // 开关开启后，无论接口返回的余额数据是否有效，一律显示「账户余额」+ 金额，不再回退到上期电费
  const wantBalance = settings.showBalanceForPostPaid && !vm.isOverdue
  const label = vm.isOverdue ? '待缴电费' : wantBalance ? '账户余额' : '上期电费'
  const amount = vm.isOverdue || wantBalance ? Math.abs(vm.remainFee) : vm.monthFee
  const amountColor = vm.isOverdue ? overdueColor : valueColor

  // 不显示户名时，参照原脚本布局：顶部居中显示国网 logo 图标
  const showLogo = !settings.showConsName || !vm.consName
  const title = showLogo ? '' : vm.consName

  return (
    <VStack alignment="leading" spacing={0} padding={{ leading: 22, trailing: 12, vertical: 24 }}>
      {showLogo ? (
        <HStack padding={{ trailing: 10 }}>
          <Spacer />
          {logoImage ? (
            <Image
              image={logoImage}
              resizable
              scaleToFit
              frame={{ width: settings.logoSize, height: settings.logoSize }}
            />
          ) : (
            <Image
              systemName="bolt.circle.fill"
              resizable
              scaleToFit
              frame={{ width: settings.logoSize, height: settings.logoSize }}
              foregroundStyle={accentColor}
            />
          )}
          <Spacer />
        </HStack>
      ) : (
        <HStack spacing={4}>
          <Image
            systemName="bolt.circle.fill"
            resizable
            scaleToFit
            frame={{ width: 16, height: 16 }}
            foregroundStyle={accentColor}
          />
          <Text font={12} fontWeight="semibold" foregroundStyle={valueColor} lineLimit={1}>
            {title}
          </Text>
        </HStack>
      )}

      <Spacer />

      <Text font={10} fontWeight="semibold" foregroundStyle={labelColor}>
        {label}
      </Text>
      <HStack alignment="firstTextBaseline" spacing={2}>
        <Text
          font={(() => {
            const s = amount.toFixed(2);
            const len = s.length;
            if (len <= 5) return 22;
            if (len === 6) return 20;
            return 18;
          })()}
          fontWeight="semibold"
          fontDesign="rounded"
          foregroundStyle={amountColor}
        >
          {amount.toFixed(2)}
        </Text>
        <Text font={11} fontWeight="semibold" foregroundStyle={vm.isOverdue ? overdueColor : labelColor}>
          元
        </Text>
      </HStack>

      <Spacer />

      <HStack spacing={3}>
        <Image
          systemName={vm.fromCache ? 'clock.arrow.circlepath' : 'checkmark.circle'}
          resizable
          scaleToFit
          frame={{ width: 11, height: 11 }}
          foregroundStyle={labelColor}
        />
        <Text font={11} fontWeight="semibold" foregroundStyle={labelColor} lineLimit={1}>
          {shortTime(vm.update)}
        </Text>
      </HStack>
    </VStack>
  )
}

/** 细实线分隔：填满父容器宽度，默认最细的半透明灰 */
function ThinLine({ color = sepGray, height = 0.5 }: { color?: ShapeStyle | DynamicShapeStyle; height?: number }) {
  return <Rectangle fill={color} frame={{ height }} />
}

/** 右侧：三栏自由定制（第一栏 + 第二栏 + 第三栏），由设置页配置 */
function RightPanel({ vm, settings }: { vm: BillViewModel; settings: SGCCSettings }) {
  return (
    <VStack alignment="leading" spacing={0} padding={{ leading: 14, trailing: 16, vertical: 22 }}>
      {/* 第一栏 */}
      <RowRenderer vm={vm} settings={settings} rowNum={1} />

      <Spacer />
      <ThinLine />
      <Spacer />

      {/* 第二栏 */}
      <RowRenderer vm={vm} settings={settings} rowNum={2} />

      <Spacer />
      <ThinLine />
      <Spacer />

      {/* 第三栏 */}
      <RowRenderer vm={vm} settings={settings} rowNum={3} />
    </VStack>
  )
}

function WidgetView({ vm, logoImage }: { vm: BillViewModel; logoImage?: UIImage | null }) {
  return (
    <HStack spacing={0} widgetBackground={panelBg}>
      <VStack spacing={0} frame={{ width: PANEL_WIDTH }} background={bg}>
        <LeftPanel vm={vm} settings={settings} logoImage={logoImage} />
      </VStack>
      <RightPanel vm={vm} settings={settings} />
    </HStack>
  )
}

function ErrorView({ message }: { message: string }) {
  return (
    <VStack spacing={6} padding={{ horizontal: 20, vertical: 16 }} widgetBackground={bg}>
      <Image
        systemName="exclamationmark.triangle.fill"
        resizable
        scaleToFit
        frame={{ width: 30, height: 30 }}
        foregroundStyle="#FF9500"
      />
      <Text font={13} fontWeight="semibold" foregroundStyle={valueColor}>
        数据加载失败
      </Text>
      <Text font={10} foregroundStyle={labelColor} multilineTextAlignment="center" lineLimit={2}>
        {message}
      </Text>
      <Text font={9} foregroundStyle={labelColor}>
        请检查 wsgw 重写与网络
      </Text>
    </VStack>
  )
}

/** 演示数据：小组件参数填 demo 时使用，便于在无网络/未配重写时预览布局 */
function demoViewModel(): BillViewModel {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const days = Array.from({ length: 10 }, (_, i) => ({
    label: `${y}${m}${String(i + 12).padStart(2, '0')}`,
    elePq: Number((6 + Math.sin(i * 1.1) * 4 + i * 0.35).toFixed(2)),
  }))
  return {
    consNo: '1234****',
    consName: '演示户名',
    isOverdue: false,
    isPostPaid: true,
    remainFee: 88.35,
    yearFee: 968.4,
    yearUsage: 515,
    monthFee: 198.25,
    monthUsage: 305,
    currentMonthEle: 37.5,
    dayFee: days[days.length - 1].elePq,
    dayElePq: days,
    monthElePq: [
      { label: `${y}06`, elePq: 210, cost: 126.5 },
      { label: `${y}07`, elePq: 305, cost: 198.25 },
    ],
    update: '演示数据',
    fromCache: false,
    cacheAgeMinutes: 0,
    step: {
      level: 1,
      usage: 515,
      percent: 10.73,
      remain: 2005,
      threshold: 2520,
      step2: 2520,
      step3: 4800,
      isOverLimit: false,
      exceed: 0,
      exceedPercent: 0,
      maxScale: 4800,
    },
  }
}

async function main() {
  const param = (Widget.parameter ?? '').trim().toLowerCase()

  // 获取国网 logo（参照原脚本 getLogo 默认图源；失败时回退到 SF Symbol）
  let logoImage: UIImage | null = null
  try {
    logoImage = await UIImage.fromURL(LOGO_URL)
  } catch (e) {
    console.log(`国网 logo 加载失败：${e instanceof Error ? e.message : e}`)
  }

  // 参数为 demo：不联网，仅用于预览布局
  if (param === 'demo') {
    Widget.present(<WidgetView vm={demoViewModel()} logoImage={logoImage} />, {
      policy: 'after',
      date: new Date(Date.now() + settings.interval * 60 * 1000),
    })
    return
  }

  // 参数决定本小组件显示哪一户：优先匹配自定义户名，其次数字 1/2/3，否则用设置里的当前账户
  const accountIndex = resolveAccountIndex(Widget.parameter ?? '', settings)

  try {
    const raw = await getBillData(settings, accountIndex)
    // 套用自定义户名（未设置则沿用数据里的实际户名）
    const customName = settings.accNames[accountIndex]?.trim()
    const vm = customName ? { ...raw, consName: customName } : raw
    Widget.present(<WidgetView vm={vm} logoImage={logoImage} />, {
      policy: 'after',
      date: new Date(Date.now() + settings.interval * 60 * 1000),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error(`小组件渲染失败：${message}`)
    Widget.present(<ErrorView message={message} />, {
      policy: 'after',
      date: new Date(Date.now() + 30 * 60 * 1000),
    })
  }
}

main()
