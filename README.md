# GrokBot Web Widget

简体中文 | [English](README.en.md)

将 Grok 风格的动画头像嵌入任意网页的一段 `<script>`。零依赖、单文件、Shadow DOM 隔离，
空闲时渲染循环完全停止（对宿主页面几乎零负担）。

> 本仓库是「GrokBot 网页插件」的开源发布版，以 **AGPL-3.0** 许可发布（见
> [LICENSE](LICENSE)）。绘制几何与表情数据来自 [nasawz/GrokBot](https://github.com/nasawz/GrokBot)
> （Flutter 实现，BSD-3-Clause），表情语义命名与眨眼档位设计参考
> [bible-strong-avatar-lab](https://github.com/smontlouis/bible-strong-avatar-lab)，
> 署名与义务详见 [NOTICE.md](NOTICE.md)。

## 特性总览

| 特性 | 说明 |
|------|------|
| 眼睛跟随鼠标 | 每 2s 采样一次光标位置，视线平滑转向（非逐帧跟随，零监听渲染开销） |
| 25 个表情 | 48 点闭合环绘制，弹簧插值切换（ω=7），语义化命名（全名单见下文） |
| 39 种状态 | 每个状态绑定表情池、换表情节奏、眨眼档位（全名单见下文） |
| 眨眼系统 | 分档位（natural/calm/attentive/active/reactive），首延、间隔、时长随状态变化 |
| 微眼跳 | 每 1.4–3.2s 一次微小视线偏移，模拟"活着"的感觉，可关闭 |
| 点击轮换 | 点击头像按序列换表情：idle→calm→idle→wide→idle→sly→idle→wink |
| 18 种形态 | blob/pebble/bean/capsule…，CSS border-radius 语法定义的轮廓 + 面部几何校正 |
| 主题 | light / dark / auto（跟随系统），支持 CSS 自定义属性覆盖颜色 |
| 悬浮球 | `<script data-float>` 一行嵌入，四向定位、自定义配色 |
| 零负担（四维） | **体积** 25 KB gzip；**CPU** 空闲 0 rAF、绘制期零解析零分配、后台页挂起全部定时器；**内存** 形态数据（Path2D/校正点）按形态全局共享、跨实例零重复；**GPU** 无滤镜/阴影/blur、DPR≤2、最小填充面积 |

## 快速开始

插件本体就是仓库里的单文件 `dist/grokbot.js`（约 25 KB gzip）——把它拷到你的网站或
用 CDN 直接引用即可：

```html
<!-- 方式一：悬浮球（默认右下角） -->
<script src="dist/grokbot.js" data-float></script>

<!-- 方式二：内联元素 -->
<script src="dist/grokbot.js"></script>
<grok-bot size="160" auto-expression state="thinking"></grok-bot>
```

CDN（无需下载，版本锁定 main 分支）：

```html
<script src="https://cdn.jsdelivr.net/gh/004Tingting/grokbot-web-widget@main/dist/grokbot.js" data-float></script>
```

```js
// 方式三：JS API
const bot = window.__Widgets.grokbot.mount({
  size: 120, shape: 'blob', theme: 'dark', state: 'thinking',
  autoExpression: true, left: 20, bottom: 20, bodyColor: '#000000',
});
bot.blink();
```

本地体验：`demo.html` 无任何网络依赖，**双击直接打开**即可；或起静态服务
（`python -m http.server`）获得和线上一致的体验。

## 仓库结构

```
├── dist/grokbot.js          # 交付单文件（嵌入网页用这个；可直接拷走）
├── src/grokbot.template.js  # 源码模板——调参改这里（常量与数据表，表情数据为占位符）
├── src/grokbot.js           # 组装产物（模板 + 表情数据，与 dist 内容相同）
├── tools/
│   ├── assemble.py          # 数据注入模板 → 生成 src/grokbot.js 与 dist/grokbot.js
│   ├── extract_expressions.py  # 从 grokbot_widget(Flutter) 源码提取表情环
│   ├── expressions.json     # 全部 25 表情 × 2 眼 × 48 点的原始数据
│   └── contact-sheet.html   # 表情目检网格（浏览器打开）
├── demo.html                # 本地演示页（含状态切换/控制台/性能自检）
├── TOOLPAGE.md              # 未来可视化调参工具页的设计蓝图
└── NOTICE.md · LICENSE · licenses/   # 署名与许可
```

## 表情与状态全名单

**25 个表情**（`expression` 属性的合法值，或 0–24 索引；定义见
`src/grokbot.template.js` 的 `RING_NAMES`）：

`upward-side-glance`（默认）· `downward-gaze` · `joyful-down-right` · `surprised-left` ·
`sleepy-squint` · `skeptical-right` · `small-attentive` · `angry-right` · `curious-left` ·
`asymmetric-down-right` · `attentive-left` · `joyful-wide` · `wide-downward-gaze` ·
`eyes-closed` · `skeptical-left` · `far-right-glance` · `angry-left` · `playful-right` ·
`asymmetric-up-left` · `gentle-downward-gaze` · `wide-down-left` · `surprised-wide-left` ·
`drowsy-closed` · `suspicious-right` · `shy-downward`

**39 个状态**（`state` 属性的合法值，大小写与连字符不敏感；每个状态绑定表情池、
换表情节奏与眨眼档位，定义见 `STATES` 表）：

- 生命周期：`sleeping` `waking` `idle`（默认） `listening` `thinking` `searching` `working`
- 反应：`excited` `surprised` `suspicious` `angry` `drowsy` `happy` `curious` `confused`
  `bored` `proud` `shy` `sad` `laughing` `scared` `playful` `celebrate`
- 代理形态：`orbit` `radar` `progress`
- 产品周期：`spawning` `humming` `loading` `dictating` `writing` `sending` `receiving`
  `uploading` `notifying` `alerting` `dragging` `bouncing` `powering-down`

示例：`idle` 池 [00, 08]、换表情 ~5.4–9.6s（源数据 9–16s × `EXPR_PACE` 0.6）、眨眼
6–14s/280ms（natural 档）；`sleeping` 不自动眨眼；`excited` 换表情 0.7–1.2s、眨眼
220ms（reactive 档）。

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
| 版本号 | `NS.grokbot` 的 `version` 字段 | 发版时与 CHANGELOG 同步 |

### 运行时属性速查

`size` · `shape` · `theme` · `state` · `expression` · `auto-blink` · `auto-expression` ·
`tracking` · `ambient` —— 详见源码头部注释与 `demo.html` 控制台。

## 开发与验证

本仓库**无构建步骤、无第三方依赖**，也暂无自动化测试，验证方式为人工回归：

1. 起静态服务（`python -m http.server`）打开 `demo.html`；
2. 检查控制台零报错、头像渲染正常、眼睛跟随鼠标、状态切换生效；
3. 性能自检：demo 页底部的长任务计数应保持 0，空闲时（鼠标静止）Performance 面板
   应无持续 rAF 活动。
4. 改动模板后必须跑 `python tools/assemble.py` 并提交 `src/grokbot.js` 与
   `dist/grokbot.js`（两者应一致）。

欢迎 Issue 与 PR；行为改动请同步 README 的调参表与 CHANGELOG。

## 从原始数据重建

`tools/extract_expressions.py` 从 [nasawz/GrokBot](https://github.com/nasawz/GrokBot)
（Flutter）的 `lib/src/data/expression_data.dart` 提取全部 25 个表情环：

```bash
python tools/extract_expressions.py <path-to-expression_data.dart> expressions.json
```

`tools/expressions.json` 为提取结果，`tools/assemble.py` 将其注入模板生成单文件产物。

## 路线图

- **可视化调参工具页**：计划在[作者个人网站](https://avatars.bible-strong.app/)参考
  [bible-strong-avatar-lab](https://github.com/smontlouis/bible-strong-avatar-lab)
  建一个可视化工作室，调整表情与形态后一键导出**原始版本**（`grokbot-avatar.json`）
  与**网页插件版本**（本仓库的单文件产物）。页面结构、面板设计与数据契约见
  [TOOLPAGE.md](TOOLPAGE.md)（实现前先更新该设计基线）。
- 更多形态、表情过渡动作（转头/转圈）、Badge/粒子效果（原版预留字段）。
- 变更记录见 [CHANGELOG.md](CHANGELOG.md)。

## 兼容性

Chrome 90+ / Edge 90+ / Firefox 90+ / Safari 14+（目标为近两年主流浏览器）。
使用 ES2020+ 与手绘椭圆圆角路径（不依赖 `ctx.roundRect`）。

## 署名与许可

本仓库以 **AGPL-3.0** 许可开源（见 [LICENSE](LICENSE)）。简要：绘制几何与表情环数据
来自 [nasawz/GrokBot](https://github.com/nasawz/GrokBot)（BSD-3-Clause）；表情语义命名、
眨眼档位数值、微眼跳思路参考
[bible-strong-avatar-lab](https://github.com/smontlouis/bible-strong-avatar-lab)
（**AGPL-3.0**）——分发本仓库或其衍生品时，请遵循 AGPL-3.0 的相应条款。
逐项来源与义务清单见 [NOTICE.md](NOTICE.md)。
