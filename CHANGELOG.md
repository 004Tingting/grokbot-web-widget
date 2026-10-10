# Changelog

所有对外可见的变更记录于此。版本号遵循语义化（SemVer）；
`window.__Widgets.grokbot.version` 与最新版本保持一致。

## 1.1.0 — 2026-10-11

- 表情系统扩容：内置全部 **25 个表情**（语义命名，`expression` 属性支持名称或索引）
- 新增 **39 种状态**（`state` 属性）：表情池 / 换表情节奏 / 眨眼档位随状态变化
- 新增**微眼跳**环境动效（`ambient` 属性可关闭）
- 悬浮球支持四向定位（`data-left/top/right/bottom`、mount `left/top`）与
  颜色覆盖（`bodyColor`/`eyeColor`、`data-body`/`data-eye`）
- 点击轮换序列调整为 idle→calm→idle→wide→idle→sly→idle→wink
- 换表情节奏系数 `EXPR_PACE = 0.6`（整体提速）
- 性能：形态数据（Path2D/校正点）按形态全局共享、弹簧插值复用缓冲、
  页面隐藏/离屏时挂起全部定时器、`desynchronized` 画布提示
- 修复：`auto-expression` 裸属性写法不生效；关闭 ambient 时残留偏移

## 1.0.0 — 2026-10-11

- 首次开源发布：单文件嵌入式动画头像
- 眼睛 2s 轮询跟随鼠标、自动眨眼、点击切换表情（5 表情）
- 18 种形态、light/dark/auto 主题、悬浮球嵌入方式
- Shadow DOM(closed) 隔离、空闲零渲染、卸载全清理
