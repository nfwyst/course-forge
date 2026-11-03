# ANIMEJS-EXAMPLES-INDEX.md

> **Skill 角色定位**: animejs 官方示例的索引表, 按"你要做什么效果"反向查找。
> **面向读者**: LLM agent。
> **版本边界**: 本课程模板锁定 `animejs@4.4.1`。不链接可变 Git 分支；请从该版本的已安装包或 Anime.js 4.4.1 发布材料中核对 API，再按本表的示例名查找等价示例。
> **License**: MIT (Julian Garnier) — 公共仓库引用, 不复制完整文件, 仅给定位 + 适用场景。
> **何时读**: 你正在为 chapter 选动画模式, 需要看真实运行效果 / 想抄核心代码片段时, 查本表。
> **何时不读**: 你只写普通入场/出场/状态切换动画, 用 SKILL.md + CHAPTER-CRAFT.md + ANIMEJS-GUIDE.md §4 基础封装足够, 不必读本表。

## 0. 用法

按效果关键词反向查，例如想做卡片 3D 翻转就看卡片堆/3D 立体。示例名是查找锚点，API 以项目锁定的 `animejs@4.4.1` 为准。

| 效果 | 示例名 | 核心 API | 适用场景 |
| --- | --- | --- | --- |
| 卡片堆 / 3D 翻转 | `onscroll-sticky` | `rotateY`、`rotateZ`、hover translateY | 多层卡片展示 |
| 响应式 3D 卡片 | `onscroll-responsive-scope` | 3D transform + media query | 设备适配卡片 |
| 钟面 / 仪表盘 | `clock-playback-controls` | timeline、easing | 时间和播放控制可视化 |
| 3D 拖拽 | `draggable-playground` | `Draggable`、`rotateX/Y` | 物理拖拽和翻转 |
| 球面 / 螺旋布局 | `auto-layout/periodic-table` | `createLayout` | 元素三维分布 |
| 3D 卡片布局 | `auto-layout/cards` | `createLayout` | 卡片重排 |
| 光晕粒子 | `additive-creature` | `mix-blend-mode` | 烟雾和发光物 |
| 跟随粒子 | `additive-fireflies` | pointer interaction | 装饰性鼠标交互 |

## 1. 字符与文本

| 效果 | 示例名 | 核心 API | 适用场景 |
| --- | --- | --- | --- |
| 标题字符入场 | `animejs-v4-logo-animation` | stagger、timeline、SVG morph | 数字翻滚和词组拆解 |
| 悬停文字 | `text/hover-effects` | `splitText` | 字符 hover |
| 字符解密 | `text/scramble` | `scrambleText` | 数字和字符扰动 |
| 多段入场 | `text/split-effects` | split + keyframes | 标题入场 |
| 打字机 | `irregular-playback-typewriter` | irregular playback | 输入效果 |

## 2. 持续动画与 SVG

| 效果 | 示例名 | 核心 API | 适用场景 |
| --- | --- | --- | --- |
| 流体漂浮 | `layered-css-transforms` | keyframes、`createSpring` | 持续装饰动效 |
| Canvas 粒子 | `canvas-2d` | RAF + JS object animation | 大量粒子 |
| 无缝循环 | `timeline-seamless-loop` | timeline | 循环动画 |
| 路径描线 | `svg-line-drawing` | `svg.createDrawable()` | 雷达、地图、对勾 |
| 数据图 | `svg-graph` | SVG mask、drawable | 折线和柱状图 |
| 网格错开 | `advanced-grid-staggering` | `stagger()` | 网格扫描 |

## 3. Timeline、状态机与交互

| 效果 | 示例名 | 核心 API | 适用场景 |
| --- | --- | --- | --- |
| 多阶段状态机 | `timeline-50K-stars` | `createTimeline`、composition | 性能和阶段切换 |
| 动态重排 | `timeline-refresh-starlings` | `timeline.refresh()` | 运行时布局刷新 |
| easing 选择 | `easings-visualizer` | easing comparison | 调试和选型 |
| 鼠标跟随 | `animatable-follow-cursor` | `createAnimatable` | 跟随效果 |
| 可排序列表 | `auto-layout/todo-list` | `createLayout` | 增删改排序 |
| 手风琴 | `auto-layout/accordion` | layout animation | FAQ 和折叠面板 |
| 拖拽轮播 | `draggable-infinite-auto-carousel` | `Draggable` | 横向轮播 |
| 拖拽吸附 | `draggable-mouse-scroll-snap-carousel` | `Draggable` + snap | 拖拽和滚轮 |

## 4. 与本模板的版本边界

- `animejs@4.4.1` 是模板的唯一动画依赖版本；不要把 4.5 及以上的 Three.js adapter API 写入该模板。
- 真 3D 需求优先用 CSS 3D，或在另一个经用户确认的项目中显式升级依赖与锁文件。
- 用示例学习范式后，重写为课程自身的动画；不要复制整段官方示例代码。
- 需要查看上游源码时，使用本地安装的精确 `animejs@4.4.1` 包或自行验证的 immutable release snapshot，不使用可变分支链接。

## 5. License 与引用规范

- Anime.js 为 MIT 许可；保留上游版权和许可要求。
- 本索引只保留示例名称、API 方向和适用场景，不复制官方完整代码。
- 课程章节必须遵守 `ANIMEJS-GUIDE.md` 的动画生命周期和可访问性约束。
