# GrokBot Web Widget

将 Grok 风格的动画头像嵌入任意网页的一段 `<script>`。零依赖、单文件、Shadow DOM 隔离，
空闲时渲染循环完全停止（对宿主页面几乎零负担）。

> 本仓库是「GrokBot 网页插件」的开源发布版。绘制几何与表情数据来自 grokbot_widget
> （Flutter 实现），表情语义命名与眨眼档位设计参考 bible-strong-avatar-lab（Web 移植版），
> 许可与署名见 [NOTICE.md](NOTICE.md)。

## 特性总览

| 特性 | 说明 |
|------|------|
| 眼睛跟随鼠标 | 每 2s 采样一次光标位置，视线平滑转向（非逐帧跟随，零监听渲染开销） |
| 25 个表情 | 48 点闭合环绘制，弹簧插值切换（ω=7），语义化命名（`joyful-wide`、`eyes-closed`…） |
| 39 种状态 | 每个状态绑定表情池、换表情节奏、眨眼档位（如 `idle`/`thinking`/`sleeping`/`excited`…） |
| 眨眼系统 | 分档位（natural/calm/attentive/active/reactive），首延、间隔、时长随状态变化 |
| 微眼跳 | 每 1.4–3.2s 一次微小视线偏移，模拟"活着"的感觉，可关闭 |
| 点击轮换 | 点击头像按序列换表情：idle→calm→idle→wide→idle→sly→idle→wink |
| 18 种形态 | blob/pebble/bean/capsule…，CSS border-radius 语法定义的轮廓 + 面部几何校正 |
| 主题 | light / dark / auto（跟随系统），支持 CSS 自定义属性覆盖颜色 |
| 悬浮球 | `<script data-float>` 一行嵌入，四向定位、自定义配色 |
| 零负担（四维） | **体积** 25 KB gzip；**CPU** 空闲 0 rAF、绘制期零解析零分配、后台页挂起全部定时器；**内存** 形态数据（Path2D/校正点）按形态全局共享、跨实例零重复；**GPU** 无滤镜/阴影/blur、DPR≤2、最小填充面积 |

## 快速开始

```html
<!-- 方式一：悬浮球（默认右下角） -->
<script src="grokbot.js" data-float></script>

<!-- 方式二：内联元素 -->
<script src="grokbot.js"></script>
<grok-bot size="160" auto-expression state="thinking"></grok-bot>
```

```js
// 方式三：JS API
const bot = window.__Widgets.grokbot.mount({
  size: 120, shape: 'blob', theme: 'dark', state: 'thinking',
  autoExpression: true, left: 20, bottom: 20, bodyColor: '#000000',
});
bot.blink();
```

本地体验：仓库根目录起任意静态服务（如 `python -m http.server`）后打开 `demo.html`。

## 调参指南（每个特性怎么调）

运行时可调（元素属性 / mount 选项 / JS API）见 `demo.html` 与源码头部注释；
更深层的 tuning 改 `src/grokbot.template.js` 顶部常量或数据表，然后重新生成：

```bash
python tools/assemble.py   # 模板 + 表情数据 → src/grokbot.js 与 dist/grokbot.js
```

| 想调什么 | 改哪里 | 说明 |
|----------|--------|------|
| 视线跟随采样间隔 | 常量 `TRACK_MS`（默认 2000） | 调小更"贴脸"，调大更省电 |
| 视线跟随幅度 | 常量 `TRACK_RADIUS`（默认 320px） | 光标距离归一化半径，越小眼睛转动越夸张 |
| 视线平滑度 | 常量 `EYE_SETTLE`（默认 14） | 越大跟随越"硬"、越小越"绵" |
| 换表情快慢 | 常量 `EXPR_PACE`（默认 0.6） | 乘在各状态节奏区间上，<1 更快、>1 更慢 |
| 表情切换弹簧 | 常量 `MORPH_W`（默认 7） | 阻尼弹簧自然频率 ω，越大切换越"弹" |
| 状态→表情池/节奏 | 数据表 `STATES` | 每行 `[表情池, 换表情min, 换表情max, 眨眼min|null, 眨眼max, 眨眼档位]`，可增删状态或改池 |
| 眨眼档位 | 数据表 `BLINK_PROFILES` | `[首次延迟ms, 单次时长ms]`，五档：natural/calm/attentive/active/reactive |
| 眨眼形状 | 常量 `BLINK_CLOSE`（0.42）与 `BLINK_MIN`（0.04） | 闭合阶段占比与眼皮最小高度 |
| 微眼跳 | `#scheduleSaccade` 内 `1400 + Math.random()*1800` 与幅度 `0.06/0.035` | 频率与幅度 |
| 点击轮换序列 | 数据表 `CYCLE` | 元素索引序列（0=upward-side-glance，见 `RING_NAMES`） |
| 形态轮廓 | 数据表 `SHAPES` | `[faceX, faceY, faceScaleX, faceScaleY, eyeScale, radius(CSS 语法), aspectX, aspectY]` |
| 配色 | 数据表 `THEMES` 或 CSS 变量 `--grokbot-body` / `--grokbot-eye` | 主题预设或宿主侧覆盖 |
| 表情形状 | `tools/expressions.json`（48 点 × 2 眼） | 改后跑 `tools/assemble.py`；`tools/contact-sheet.html` 可目检 |

### 运行时属性速查

`size` · `shape` · `theme` · `state` · `expression` · `auto-blink` · `auto-expression` ·
`tracking` · `ambient` —— 详见源码头部注释与 `demo.html` 控制台。

## 从原始数据重建

`tools/extract_expressions.py` 从 grokbot_widget（Flutter）的 `expression_data.dart`
提取全部 25 个表情环（需手动指定该文件路径）；`tools/expressions.json` 为提取结果，
`tools/assemble.py` 将其注入模板生成单文件产物。

## 路线图

- **可视化调参工具页**：计划在[作者个人网站](https://avatars.bible-strong.app/)参考
  [bible-strong-avatar-lab](https://github.com/smontlouis/bible-strong-avatar-lab)
  建一个可视化工作室，调整表情与形态后一键导出**原始版本**（`grokbot-avatar.json`）
  与**网页插件版本**（本仓库的单文件产物）。页面结构、面板设计与数据契约见
  [TOOLPAGE.md](TOOLPAGE.md)（实现前先更新该设计基线）。
- 更多形态、表情过渡动作（转头/转圈）、Badge/粒子效果（原版预留字段）。

## 兼容性

Chrome 90+ / Edge 90+ / Firefox 90+ / Safari 14+（目标为近两年主流浏览器）。
使用 ES2020+ 与手绘椭圆圆角路径（不依赖 `ctx.roundRect`）。

## 署名与许可

见 [NOTICE.md](NOTICE.md)。简要：绘制几何与表情环数据来自 grokbot_widget（用户提供的
Flutter 源码）；表情语义命名、眨眼档位数值、微眼跳思路参考
[bible-strong-avatar-lab](https://github.com/smontlouis/bible-strong-avatar-lab)
（**AGPL-3.0**）——分发本仓库或其衍生品时，请遵循 AGPL-3.0 的相应条款。
