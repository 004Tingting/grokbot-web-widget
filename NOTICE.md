# NOTICE — 署名与许可

本仓库（GrokBot Web Widget）包含来自以下项目的素材与设计，使用前请阅读：

## 1. grokbot_widget（Flutter，BSD 3-Clause）

- 来源：[nasawz/GrokBot](https://github.com/nasawz/GrokBot)
  （Copyright (c) 2026, nasawz，BSD 3-Clause License，随仓库附于
  `licenses/grokbot_widget-BSD-3-Clause.txt`）
- 本仓库使用的内容：身体/面部几何常量（viewbox 259、face center 114.2705 等）、
  25 个表情的 48 点闭合环坐标数据（`tools/expressions.json`，由其
  `lib/src/data/expression_data.dart` 提取）、18 种形态的面部校正参数、
  39 种状态的表情池与节奏区间（`state_data.dart`）、视线映射（±13.2 / ±8.4）、
  眨眼相位（42% 闭合 / 58% 睁开）、表情切换阻尼弹簧（ω=7）。
- 义务：保留其版权与许可声明（BSD 3-Clause）。

## 2. bible-strong-avatar-lab（Web，AGPL-3.0）

- 来源：<https://github.com/smontlouis/bible-strong-avatar-lab>
- 本仓库参考的内容：25 个表情的语义命名表（`upward-side-glance` … `shy-downward`）、
  眨眼五档位设计（natural / calm / attentive / active / reactive 的首次延迟与时长数值）、
  微眼跳（microSaccades）环境动效的设计思路。
- 许可：**AGPL-3.0**。本仓库因包含源自该项目的素材与设计，分发时请遵循
  AGPL-3.0 的相应条款（包含保留版权声明、以相同许可证开源等）。
  如需闭源商业分发，请替换或独立重写上述借鉴内容。

## 3. 本仓库原创部分

- Canvas 绘制管线（Path2D 预缓存、圆角路径手绘实现）、2s 视线轮询采样、
  Shadow DOM(closed) 封装、状态机与定时器调度、悬浮球嵌入方式、
  调参常量与构建脚本（`tools/*.py`）。

发布前请自行确认上述第三方内容的最新许可证状态。
