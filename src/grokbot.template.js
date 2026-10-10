/*!
 * GrokBot Web Widget v1.0 — 仿 Grok 动画头像（网页嵌入式插件）
 *
 * 移植自 grokbot_widget（Flutter）：几何常量、视线映射、眨眼节奏、
 * 表情弹簧参数与原版保持一致；本实现为零依赖原生 JS。
 *
 * 设计目标：对宿主页面几乎零负担——
 *   · 空闲时零 CPU（无动画时 rAF 循环完全停止；视线按固定 2s 轮询采样，
 *     pointermove 仅记录坐标、不触发任何渲染；微眼跳为稀疏事件）
 *   · 39 种状态（state 属性）：状态池/节奏移植自 grokbot_widget，
 *     眨眼档位与微眼跳参考 bible-strong-avatar-lab
 *   · 离屏 / 标签页隐藏时不渲染、不重绘
 *   · Shadow DOM(closed) 样式隔离；唯一全局入口 window.__Widgets
 *   · 卸载（disconnectedCallback）时移除全部监听/定时器/observer
 *
 * 嵌入：
 *   <script src="grokbot.js" data-float></script>        → 悬浮球（默认右下角，可 data-left 等定位）
 *   <grok-bot></grok-bot>                                → 任意位置内联
 */
(() => {
  'use strict';

  /* ---------- 几何常量（与 Flutter 版 grokbot_widget 对齐） ---------- */
  const VIEWBOX = 259;      // 设计稿视口边长
  const INSET = 15;         // 视口内边距
  const FACE = 114.2705;    // 面部中心
  const BODY = 210;         // 身体基准边长
  const GAZE_X = 13.2;      // 视线水平最大偏移（设计单位）
  const GAZE_Y = 8.4;       // 视线垂直最大偏移
  const BLINK_MIN = 0.04;   // 眨眼时眼睛最小高度比例
  const BLINK_CLOSE = 0.42; // 闭合阶段占整程比例（时长随状态档位 220–420ms）
  const MORPH_W = 7;        // 表情切换阻尼弹簧自然频率 ω
  const TRACK_MS = 2000;    // 视线跟随：固定 2s 轮询采样光标位置
  const TRACK_RADIUS = 320; // 视线跟随：光标距离归一化半径（px）
  const EYE_SETTLE = 14;    // 视线趋近速率（指数平滑）
  const EXPR_PACE = 0.6;    // 换表情节奏系数：<1 更快（作用于各状态的节奏区间）

  /* 形态表：[faceX, faceY, faceScaleX, faceScaleY, eyeScale, radius, aspectX, aspectY] */
  const SHAPES = {
    blob: [0, 0, 1, 1, 1, '50%', 1, 1],
    pebble: [2, 0, .97, .86, 1, '43% 57% 48% 52%', 1.02, .94],
    bean: [0, 0, .72, .9, .87, '58% 42% 54% 46%', .92, 1.02],
    egg: [0, 2, .77, .97, .93, '50% 50% 56% 44%', .88, 1.05],
    squircle: [0, 0, 1, 1, 1, '28%', 1, 1],
    tablet: [0, 0, .94, .65, .82, '28%', .78, 1.08],
    capsule: [0, 0, .64, .92, .81, '50% / 32%', .64, 1.08],
    cylinder: [0, 0, .85, .96, .99, '42% / 18%', .82, 1.04],
    hex: [0, 0, .91, .91, 1, '18%', 1, 1],
    gem: [0, 0, .89, .89, .99, '35% 15% 38% 18%', .95, 1.02],
    crystal: [0, 0, .71, .89, .86, '12% 38% 16% 42%', .9, 1.05],
    wedge: [0, 24, .7, .7, .79, '15% 50% 50% 15%', 1, 1],
    shield: [0, 0, .79, .98, .95, '45% 45% 58% 58%', .95, 1.05],
    dome: [0, 4, .85, .68, .82, '50% 50% 30% 30%', 1.02, .92],
    arch: [0, 0, .67, .97, .85, '50% 50% 22% 22%', .9, 1.05],
    cloud: [0, 4, .79, .7, .81, '42% 58% 48% 52%', 1.05, .88],
    teardrop: [0, 22, .79, .79, .88, '50% 50% 62% 38%', .9, 1.05],
    leaf: [0, 0, .73, .91, .88, '62% 38% 62% 38%', .88, 1.05],
  };

  /* 内置表情环（构建时由 tools/assemble.py 注入，48 点 × 2 眼，扁平 [x,y,...]）
     25 个表情全量，语义命名参考 bible-strong-avatar-lab（同一表情系统的 web 移植） */
  const RING_NAMES = [
    'upward-side-glance', 'downward-gaze', 'joyful-down-right', 'surprised-left',
    'sleepy-squint', 'skeptical-right', 'small-attentive', 'angry-right',
    'curious-left', 'asymmetric-down-right', 'attentive-left', 'joyful-wide',
    'wide-downward-gaze', 'eyes-closed', 'skeptical-left', 'far-right-glance',
    'angry-left', 'playful-right', 'asymmetric-up-left', 'gentle-downward-gaze',
    'wide-down-left', 'surprised-wide-left', 'drowsy-closed', 'suspicious-right',
    'shy-downward',
  ];
  const RINGS = /*__RINGS__*/null;

  /* 点击轮换序列：两两表情之间插回 idle（仅点击路径使用） */
  const CYCLE = [0, 1, 0, 2, 0, 3, 0, 4];

  /* 状态表（状态池与换表情节奏移植自 grokbot_widget state_data.dart；
     眨眼首延/时长参考 bible-strong-avatar-lab 的 blinkProfiles）
     行格式：[表情池, 换表情min, 换表情max, 眨眼min|null, 眨眼max, 眨眼档位] */
  const STATES = {
    sleeping: [[13, 22, 4], 6000, 10000],
    waking: [[13], 800, 800],
    idle: [[0, 8], 9000, 16000, 6000, 14000, 0],
    listening: [[10, 1, 19], 2800, 5000, 3000, 7000, 2],
    thinking: [[8, 16, 14, 17, 5], 2000, 3600, 3500, 7000, 3],
    searching: [[15, 9, 3, 20, 12, 18], 1000, 1800, 1600, 4000, 3],
    working: [[7, 16, 11, 10], 1800, 3200, 2800, 5500, 3],
    excited: [[2, 17, 21, 3, 11], 1100, 2000, 2000, 4000, 4],
    surprised: [[3, 21], 2500, 4000, 1800, 3500, 4],
    suspicious: [[14, 5, 23], 2600, 4500, 4500, 8000, 3],
    angry: [[7, 16], 2200, 3800, 3500, 7000, 3],
    drowsy: [[4, 22, 13], 4000, 8000],
    happy: [[2, 11, 17, 19], 2500, 4500, 2500, 5000, 3],
    curious: [[3, 21, 0, 15], 1800, 3200, 2500, 5500, 3],
    confused: [[14, 5, 8], 2200, 3800, 2800, 5500, 3],
    bored: [[4, 22, 0], 3500, 6000, 4000, 8000, 1],
    proud: [[15, 8, 2], 3500, 6000, 3500, 7000, 3],
    shy: [[0, 24, 13], 3000, 5500, 3000, 6000, 3],
    sad: [[4, 13, 22], 4000, 7000, 4000, 8000, 1],
    laughing: [[2, 11, 17], 1200, 2400, 2500, 5000, 4],
    scared: [[3, 21], 900, 1800, 1200, 3000, 4],
    playful: [[2, 17, 11, 8], 1500, 3000, 2000, 4500, 3],
    celebrate: [[2, 8, 17], 1400, 2600, 2200, 4500, 4],
    orbit: [[0, 8], 4000, 8000],
    radar: [[0, 8], 4000, 8000],
    progress: [[0, 8], 4000, 8000],
    spawning: [[3, 0], 1200, 1200],
    humming: [[0, 8], 5000, 9000, 4000, 8000, 3],
    loading: [[0, 8], 6000, 10000],
    dictating: [[10, 1, 19], 4000, 8000],
    writing: [[15, 9], 4000, 8000],
    sending: [[0, 8], 4000, 8000],
    receiving: [[19, 0, 8], 4000, 8000],
    uploading: [[15, 9, 8], 4000, 8000],
    notifying: [[3, 21, 0], 1500, 2600, 2000, 4000, 3],
    alerting: [[3, 21], 2000, 3600],
    dragging: [[3, 15, 0], 1600, 3000, 2200, 4500, 3],
    bouncing: [[2, 17], 3000, 6000],
    poweringDown: [[13, 22], 6000, 9000],
  };
  /* 眨眼档位：[首次延迟 ms, 单次时长 ms]（0 natural · 1 calm · 2 attentive · 3 active · 4 reactive） */
  const BLINK_PROFILES = [[2600, 280], [4800, 420], [3200, 240], [2100, 260], [1200, 220]];

  const THEMES = {
    light: { body: '#5b7fe5', eye: '#fffdf7' },
    dark: { body: '#6689ea', eye: '#181a15' },
  };

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  /* 椭圆圆角矩形路径（四角 [[rx,ry]×4]，tl/tr/br/bl）；p 为 Path2D */
  function roundRectPath(p, x, y, w, h, r) {
    const [tl, tr, br, bl] = r;
    const PI = Math.PI;
    p.moveTo(x + tl[0], y);
    p.lineTo(x + w - tr[0], y);
    p.ellipse(x + w - tr[0], y + tr[1], tr[0], tr[1], 0, -PI / 2, 0);
    p.lineTo(x + w, y + h - br[1]);
    p.ellipse(x + w - br[0], y + h - br[1], br[0], br[1], 0, 0, PI / 2);
    p.lineTo(x + bl[0], y + h);
    p.ellipse(x + bl[0], y + h - bl[1], bl[0], bl[1], 0, PI / 2, PI);
    p.lineTo(x, y + tl[1]);
    p.ellipse(x + tl[0], y + tl[1], tl[0], tl[1], 0, PI, PI * 1.5);
    p.closePath();
  }

  /* ---------- CSS border-radius 解析（对应原版 parseBorderRadius 子集） ---------- */
  function cornerRadii(css, w, h) {
    const parts = css.split('/');
    const expand = (s) => {
      const t = s.trim().split(/\s+/).filter(Boolean);
      if (t.length === 0) return ['0', '0', '0', '0'];
      if (t.length === 1) return [t[0], t[0], t[0], t[0]];
      if (t.length === 2) return [t[0], t[1], t[0], t[1]];
      if (t.length === 3) return [t[0], t[1], t[2], t[1]];
      return t.slice(0, 4);
    };
    const num = (tok, axis) => {
      const v = tok.endsWith('%') ? (parseFloat(tok) / 100) * axis : parseFloat(tok);
      return Math.max(0, v || 0);
    };
    const H = expand(parts[0]);
    const V = parts.length > 1 ? expand(parts[1]) : H;
    const r = [0, 1, 2, 3].map((i) => [num(H[i], w), num(V[i], h)]);
    // 相邻两角半径之和超过边长时按比例收缩（CSS 规则）
    const fit = (a, b, size, xi) => {
      const sum = r[a][xi] + r[b][xi];
      if (sum > size && sum > 0) {
        const k = size / sum;
        r[a][xi] *= k;
        r[b][xi] *= k;
      }
    };
    fit(0, 1, w, 0); fit(3, 2, w, 0); fit(0, 3, h, 1); fit(1, 2, h, 1);
    return r;
  }

  /* 形态准备数据缓存（跨实例共享）：校正点、质心与 Path2D 只依赖形态，
     不可变；N 个同形态实例共享一份（省内存 + 提升热数据缓存局部性） */
  const PREP_CACHE = new Map();
  function getPrepared(name) {
    let entry = PREP_CACHE.get(name);
    if (entry) return entry;
    const s = SHAPES[name];
    const [fx, fy, fsx, fsy, , radius, ax, ay] = s;
    const ox = FACE + fx, oy = FACE + fy;
    const w = BODY * ax, h = BODY * ay;
    const bodyPath = new Path2D();
    roundRectPath(bodyPath, FACE - w / 2, FACE - h / 2, w, h,
      cornerRadii(radius, w, h));
    const rings = RINGS.map((ring) => ring.map((eye) => {
      const pts = new Float32Array(eye.length);
      const path = new Path2D();
      let sx = 0, sy = 0;
      const n = eye.length / 2;
      for (let i = 0; i < eye.length; i += 2) {
        const x = ox + (eye[i] - FACE) * fsx;
        const y = oy + (eye[i + 1] - FACE) * fsy;
        pts[i] = x; pts[i + 1] = y;
        if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
        sx += x; sy += y;
      }
      path.closePath();
      return { pts, path, cx: sx / n, cy: sy / n };
    }));
    entry = { bodyPath, rings };
    PREP_CACHE.set(name, entry);
    return entry;
  }

  class GrokBotElement extends HTMLElement {
    static get observedAttributes() {
      return ['size', 'shape', 'theme', 'expression', 'auto-blink', 'auto-expression', 'tracking', 'state', 'ambient'];
    }

    connectedCallback() {
      if (this.#ready) return;
      if (RINGS === null) return; // 数据未注入（构建残缺），拒绝挂载
      this.#init();
    }

    disconnectedCallback() { this.#destroy(); }

    attributeChangedCallback(name, oldV, newV) {
      if (!this.#ready || oldV === newV) return;
      if (name === 'size') this.#applySize();
      else if (name === 'shape' || name === 'expression') this.#applyShapeAndExpression();
      else if (name === 'theme') this.#applyColors();
      else if (name === 'auto-blink') this.#scheduleBlink();
      else if (name === 'auto-expression') this.#scheduleExpression();
      else if (name === 'tracking') this.#poll(); // off→on 立即采样一次
      else if (name === 'state') {
        this.#applyState();
        this.#applyShapeAndExpression(); // 回到新状态的池首表情（锁定表情时除外）
        this.#scheduleBlink();
        this.#scheduleExpression();
      } else if (name === 'ambient') {
        if (newV === 'off') { this.#sac.x = 0; this.#sac.y = 0; } // 清除残留偏移
        this.#scheduleSaccade();
      }
      this.#wake();
    }

    /* ----- 公开 API ----- */
    /** 手动眨眼一次 */
    blink() {
      if (!this.#ready) return;
      this.#blinkAt = performance.now();
      this.#wake();
    }
    /** 设置表情：名称（idle/calm/wide/sly/wink）、数字索引；null 表示解锁回到池默认 */
    setExpression(which) {
      if (!this.#ready) return;
      this.setAttribute('expression', which === null ? 'none' : String(which));
      this.#applyShapeAndExpression();
      this.#wake();
    }
    /** tracking=off 时手动设置视线，x/y ∈ [-1,1] */
    setGaze(x, y) {
      if (!this.#ready) return;
      this.#gazeT.x = clamp(+x || 0, -1, 1);
      this.#gazeT.y = clamp(+y || 0, -1, 1);
      this.#wake();
    }

    /* ----- 内部状态 ----- */
    #ready = false;
    #destroyed = false;
    #shadow = null;              // closed shadow root 必须自存引用（this.shadowRoot 为 null）
    #cv; #ctx; #dpr = 1; #cssSize = 120;
    #shapeName = 'blob'; #shape = SHAPES.blob;
    #prep = null;                // 共享形态准备数据 {bodyPath, rings}（PREP_CACHE）
    #scratch = null;             // 表情弹簧插值的复用缓冲 [Float32Array, Float32Array]
    #mf = null;                  // 变形中途换目标时的固化快照缓冲
    #ringIdx = 0;                // 当前表情索引
    #cyclePos = 0;               // 点击轮换序列位置（CYCLE 的下标）
    #lockExpr = null;            // expression 属性锁定的表情
    #stateName = 'idle';         // 当前状态
    #stateCfg = null;            // 当前状态配置（STATES 行解析结果）
    #seq = [0];                  // 状态轮换序列（两两之间插 idle）
    #seqPos = 0;                 // 状态轮换序列位置
    #blinkMs = 320;              // 眨眼时长（随状态档位）
    #firstBlink = true;          // 状态切换后的首次眨眼用 initialDelay
    #sac = { x: 0, y: 0 };       // 微眼跳偏移（ambient）
    #sacTimer = 0;
    #gaze = { x: 0, y: 0 };      // 当前渲染视线
    #gazeT = { x: 0, y: 0 };     // 目标视线
    #mx = 0; #my = 0; #hasMouse = false;
    #blinkAt = -1;               // 本次眨眼起始时间戳
    #blinkTimer = 0; #exprTimer = 0; #trackTimer = 0; #raf = 0; #last = 0;
    #morphM = 1; #morphV = 0; #morphFrom = null;
    #visible = true;
    #colors = { body: THEMES.light.body, eye: THEMES.light.eye };
    #mediaDark = null; #mediaMotion = null;
    #offMove; #offResize; #offClick; #offVis; #io = null;

    /* 固定 TRACK_MS 轮询：读一次光标与自身位置，更新视线目标。
       仅在目标确实变化时唤醒 rAF；隐藏/离屏/未动过鼠标时跳过。 */
    #poll = () => {
      if (this.#destroyed || !this.#ready) return;
      if (this.getAttribute('tracking') === 'off') return;
      if (!this.#hasMouse || document.hidden || !this.#visible) return;
      const r = this.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const tx = clamp((this.#mx - cx) / TRACK_RADIUS, -1, 1);
      const ty = clamp((this.#my - cy) / TRACK_RADIUS, -1, 1);
      if (Math.abs(tx - this.#gazeT.x) > 0.001 || Math.abs(ty - this.#gazeT.y) > 0.001) {
        this.#gazeT.x = tx; this.#gazeT.y = ty;
        this.#wake();
      }
    };

    #init() {
      this.#shadow = this.attachShadow({ mode: 'closed' });
      this.#cssSize = Math.max(24, parseFloat(this.getAttribute('size')) || 120);

      const style = document.createElement('style');
      style.textContent = this.#styleText();
      this.#cv = document.createElement('canvas');
      this.#shadow.append(style, this.#cv);
      this.#ctx = this.#cv.getContext('2d', { desynchronized: true }); // 降低呈现延迟（不支持时自动忽略）
      this.#dpr = Math.min(window.devicePixelRatio || 1, 2); // 3x 屏按 2x 渲染，省填充开销

      if (!this.hasAttribute('role')) {
        this.setAttribute('role', 'img');
        this.setAttribute('aria-label', 'GrokBot 动画头像');
      }

      this.#mediaMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.#mediaDark = window.matchMedia('(prefers-color-scheme: dark)');

      this.#applyColors();
      this.#applySize();
      this.#applyState();
      this.#applyShapeAndExpression();

      /* 事件监听：全部记名，卸载时逐个移除。
         pointermove 仅记录坐标，不触发任何渲染；视线按 TRACK_MS 固定轮询采样。 */
      this.#offMove = on(window, 'pointermove', (e) => {
        this.#mx = e.clientX; this.#my = e.clientY;
        this.#hasMouse = true;
      }, { passive: true });
      this.#offResize = on(window, 'resize', () => {
        this.#dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.#applySize(); this.#wake();
      }, { passive: true });
      this.#offClick = on(this, 'click', () => this.#cycleExpression());

      this.#offVis = on(document, 'visibilitychange', () => {
        if (document.hidden) this.#pauseAll();
        else this.#resumeAll();
      });
      this.#io = new IntersectionObserver((entries) => {
        this.#visible = entries[0] && entries[0].isIntersecting;
        if (this.#visible) this.#resumeAll();
        else this.#pauseAll();
      });
      this.#io.observe(this);

      this.#trackTimer = setInterval(this.#poll, TRACK_MS);
      this.#scheduleBlink();
      this.#scheduleExpression();
      this.#scheduleSaccade();
      this.#ready = true;
      this.#wake(); // 首帧绘制
    }

    #destroy() {
      if (this.#destroyed) return;
      this.#destroyed = true;
      this.#sleep(); // 停 rAF
      clearTimeout(this.#blinkTimer); clearTimeout(this.#exprTimer);
      clearInterval(this.#trackTimer); clearTimeout(this.#sacTimer);
      if (this.#offMove) this.#offMove(); if (this.#offResize) this.#offResize();
      if (this.#offClick) this.#offClick();
      if (this.#offVis) this.#offVis();
      if (this.#io) this.#io.disconnect();
      if (this.#mediaDark) this.#mediaDark.onchange = null;
      this.#prep = null; this.#scratch = null; this.#mf = null; this.#morphFrom = null;
    }

    /* 隐藏（标签页切走 / 离屏）时停止一切渲染活动 */
    #sleep() {
      if (this.#raf) { cancelAnimationFrame(this.#raf); this.#raf = 0; }
    }

    /* 隐藏/离屏：停 rAF 并挂起全部定时器（标签页后台零唤醒） */
    #pauseAll() {
      this.#sleep();
      clearInterval(this.#trackTimer); this.#trackTimer = 0;
      clearTimeout(this.#blinkTimer); this.#blinkTimer = 0;
      clearTimeout(this.#exprTimer); this.#exprTimer = 0;
      clearTimeout(this.#sacTimer); this.#sacTimer = 0;
    }

    #resumeAll() {
      if (this.#destroyed || !this.#ready || document.hidden) return;
      if (!this.#trackTimer) this.#trackTimer = setInterval(this.#poll, TRACK_MS);
      this.#poll(); this.#wake();
      this.#scheduleBlink(); this.#scheduleExpression(); this.#scheduleSaccade();
    }

    /* 需要动效时唤醒 rAF；动画结束自动停（空闲零 CPU 的关键） */
    #wake() {
      if (this.#raf || !this.#ready || this.#destroyed) return;
      if (document.hidden || !this.#visible) return;
      this.#last = performance.now();
      this.#raf = requestAnimationFrame(this.#tick);
    }

    #tick = (now) => {
      const dt = Math.min((now - this.#last) / 1000, 0.1);
      this.#last = now;
      let active = false;

      /* 1) 视线指数趋近（目标 = 光标视线 + 微眼跳偏移） */
      const tx = clamp(this.#gazeT.x + this.#sac.x, -1, 1);
      const ty = clamp(this.#gazeT.y + this.#sac.y, -1, 1);
      const k = 1 - Math.exp(-dt * EYE_SETTLE);
      this.#gaze.x += (tx - this.#gaze.x) * k;
      this.#gaze.y += (ty - this.#gaze.y) * k;
      if (Math.abs(tx - this.#gaze.x) > 0.001 ||
          Math.abs(ty - this.#gaze.y) > 0.001) active = true;

      /* 2) 表情弹簧（对应原版 120Hz 子步进阻尼弹簧） */
      if (this.#morphFrom) {
        let remain = dt;
        while (remain > 0) {
          const step = Math.min(remain, 1 / 120);
          this.#morphV += (-2 * MORPH_W * this.#morphV - MORPH_W * MORPH_W * (this.#morphM - 1)) * step;
          this.#morphM += this.#morphV * step;
          remain -= step;
        }
        if (Math.abs(this.#morphM - 1) < 0.001 && Math.abs(this.#morphV) < 0.001) {
          this.#morphM = 1; this.#morphV = 0; this.#morphFrom = null;
        } else active = true;
      }

      /* 3) 眨眼进度（时长随状态档位 220–420ms） */
      let blinkScale = 1;
      if (this.#blinkAt >= 0) {
        const p = (now - this.#blinkAt) / this.#blinkMs;
        if (p >= 1) this.#blinkAt = -1;
        else {
          blinkScale = Math.max(
            p < BLINK_CLOSE ? 1 - p / BLINK_CLOSE : (p - BLINK_CLOSE) / (1 - BLINK_CLOSE),
            BLINK_MIN,
          );
          active = true;
        }
      }

      this.#draw(blinkScale);
      this.#raf = active ? requestAnimationFrame(this.#tick) : 0;
    };

    #applySize() {
      this.#cssSize = Math.max(24, parseFloat(this.getAttribute('size')) || 120);
      const px = Math.round(this.#cssSize * this.#dpr);
      this.#cv.width = px; this.#cv.height = px;
      const st = this.#shadow.querySelector('style');
      if (st) st.textContent = this.#styleText();
    }

    #styleText() {
      return ':host{display:inline-block;width:' + this.#cssSize + 'px;height:' +
        this.#cssSize + 'px;contain:content;} canvas{display:block;width:100%;height:100%;}';
    }

    #applyColors() {
      const mode = this.getAttribute('theme') || 'light';
      this.#mediaDark.onchange = null;
      if (mode === 'auto') {
        // 跟随系统深浅色（监听系统主题变化）
        this.#mediaDark.onchange = () => this.#applyAutoColors();
        this.#applyAutoColors();
      } else {
        const preset = THEMES[mode] || THEMES.light;
        const cs = getComputedStyle(this);
        this.#colors = {
          body: cs.getPropertyValue('--grokbot-body').trim() || preset.body,
          eye: cs.getPropertyValue('--grokbot-eye').trim() || preset.eye,
        };
      }
    }

    #applyAutoColors() {
      const dark = this.#mediaDark.matches;
      const cs = getComputedStyle(this);
      this.#colors = {
        body: cs.getPropertyValue('--grokbot-body').trim() || THEMES[dark ? 'dark' : 'light'].body,
        eye: cs.getPropertyValue('--grokbot-eye').trim() || THEMES[dark ? 'dark' : 'light'].eye,
      };
      this.#wake();
    }

    #applyShapeAndExpression() {
      this.#shapeName = SHAPES[this.getAttribute('shape')] ? this.getAttribute('shape') : 'blob';
      this.#shape = SHAPES[this.#shapeName];
      this.#applyShape();
      const exprAttr = this.getAttribute('expression');
      this.#lockExpr = parseExpression(exprAttr);
      const target = this.#lockExpr !== null ? this.#lockExpr : this.#stateCfg.pool[0];
      this.#setRing(target);
      this.#syncCycle(target);
      this.#seqPos = 0;
    }

    /* 绑定共享形态数据（跨实例复用），并分配本实例的插值工作缓冲 */
    #applyShape() {
      this.#prep = getPrepared(this.#shapeName);
      if (!this.#scratch) {
        const len = this.#prep.rings[0][0].pts.length;
        this.#scratch = [new Float32Array(len), new Float32Array(len)];
        this.#mf = [new Float32Array(len), new Float32Array(len)];
      }
    }

    /* 解析 state 属性 → 状态配置 + 状态轮换序列（两两表情之间插 idle） */
    #applyState() {
      const key = (this.getAttribute('state') || 'idle').replace(/[-_]/g, '').toLowerCase();
      const row = STATES[key] || STATES.idle;
      const [pool, eMin, eMax, bMin, bMax, bClass] = row;
      const prof = BLINK_PROFILES[bClass === undefined ? 3 : bClass];
      this.#stateName = STATES[key] ? key : 'idle';
      this.#stateCfg = {
        pool,
        exprMin: Math.round(eMin * EXPR_PACE),
        exprMax: Math.round(eMax * EXPR_PACE),
        blink: bMin === undefined ? null : { min: bMin, max: bMax, ms: prof[1], init: prof[0] },
      };
      this.#blinkMs = this.#stateCfg.blink ? this.#stateCfg.blink.ms : 320;
      this.#firstBlink = true;
      const seq = [];
      for (let i = 0; i < pool.length; i++) {
        if (i > 0 && pool[i] !== 0 && seq[seq.length - 1] !== 0) seq.push(0);
        seq.push(pool[i]);
      }
      if (seq.length > 1 && seq[0] === seq[seq.length - 1]) seq.pop();
      this.#seq = seq;
      this.#seqPos = 0;
    }

    /* 点击路径：沿 CYCLE 序列前进一步（idle→calm→idle→wide→idle→sly→idle→wink→…） */
    #advanceCycle() {
      this.#cyclePos = (this.#cyclePos + 1) % CYCLE.length;
      return CYCLE[this.#cyclePos];
    }

    /* 自动路径：沿当前状态的轮换序列前进一步 */
    #advanceSeq() {
      const seq = this.#seq;
      if (!seq || seq.length < 2) return this.#ringIdx;
      let next = this.#ringIdx;
      for (let guard = 0; guard < seq.length; guard++) {
        this.#seqPos = (this.#seqPos + 1) % seq.length;
        next = seq[this.#seqPos];
        if (next !== this.#ringIdx) break;
      }
      return next;
    }

    /* 显式跳转表情时，把点击序列指针对齐到该表情首次出现的位置 */
    #syncCycle(idx) {
      const p = CYCLE.indexOf(idx);
      if (p >= 0) this.#cyclePos = p;
    }

    #setRing(idx, animate) {
      if (idx === this.#ringIdx && this.#morphM === 1) return;
      const target = this.#prep.rings[idx];
      if (!target) return;
      if (animate && !this.#mediaMotion.matches) {
        if (this.#morphFrom) {
          // 变形中途换目标：把当前插值固化到 #mf 快照（一次性小拷贝）
          const disp = this.#displayed();
          this.#mf.forEach((buf, i) => buf.set(disp[i].pts));
          this.#morphFrom = this.#mf.map((buf, i) => ({ pts: buf, cx: disp[i].cx, cy: disp[i].cy }));
        } else {
          this.#morphFrom = this.#prep.rings[this.#ringIdx]; // 共享只读起点，零拷贝
        }
        this.#morphM = 0; this.#morphV = 0;
      } else {
        this.#morphFrom = null; this.#morphM = 1; this.#morphV = 0;
      }
      this.#ringIdx = idx;
    }

    /* 当前插值显示的环：非变形期直接返回共享数据（零分配）；
       变形期写入复用 scratch 缓冲，仅为插值几何临时构建 Path2D */
    #displayed() {
      const rings = this.#prep.rings;
      if (!this.#morphFrom) return rings[this.#ringIdx];
      const t = clamp(this.#morphM, 0, 1);
      return rings[this.#ringIdx].map((eye, i) => {
        const from = this.#morphFrom[i];
        const out = this.#scratch[i].length === eye.pts.length
          ? this.#scratch[i]
          : new Float32Array(eye.pts.length);
        for (let j = 0; j < out.length; j += 2) {
          out[j] = from.pts[j] + (eye.pts[j] - from.pts[j]) * t;
          out[j + 1] = from.pts[j + 1] + (eye.pts[j + 1] - from.pts[j + 1]) * t;
        }
        const path = new Path2D();
        path.moveTo(out[0], out[1]);
        for (let j = 2; j < out.length; j += 2) path.lineTo(out[j], out[j + 1]);
        path.closePath();
        return {
          pts: out, path,
          cx: from.cx + (eye.cx - from.cx) * t,
          cy: from.cy + (eye.cy - from.cy) * t,
        };
      });
    }

    #cycleExpression() {
      if (RINGS.length < 2) return;
      this.#lockExpr = null;
      if (this.getAttribute('expression') !== null) this.setAttribute('expression', 'none');
      this.#setRing(this.#advanceCycle(), true);
      this.#wake();
    }

    #scheduleBlink() {
      clearTimeout(this.#blinkTimer);
      const auto = this.getAttribute('auto-blink') !== 'off' && !this.#mediaMotion.matches;
      const bc = this.#stateCfg && this.#stateCfg.blink;
      if (!auto || !bc) return;
      // 状态切换后首次用档位 initialDelay，其后按状态节奏区间随机（移植自两份参考实现）
      const delay = this.#firstBlink ? bc.init : bc.min + Math.random() * (bc.max - bc.min);
      this.#firstBlink = false;
      this.#blinkTimer = setTimeout(() => {
        if (this.#destroyed) return;
        if (!document.hidden && this.#visible) { this.#blinkAt = performance.now(); this.#wake(); }
        this.#scheduleBlink();
      }, delay);
    }

    /* 微眼跳（参考 bible-strong-avatar-lab ambientMotion microSaccades）：
       每 1.4–3.2s 一次微小视线偏移，稀疏事件实现，收敛后归零开销 */
    #scheduleSaccade() {
      clearTimeout(this.#sacTimer);
      if (this.getAttribute('ambient') === 'off' || this.#mediaMotion.matches) return;
      this.#sacTimer = setTimeout(() => {
        if (this.#destroyed) return;
        if (!document.hidden && this.#visible) {
          this.#sac.x = (Math.random() * 2 - 1) * 0.06;
          this.#sac.y = (Math.random() * 2 - 1) * 0.035;
          this.#wake();
        }
        this.#scheduleSaccade();
      }, 1400 + Math.random() * 1800);
    }

    #scheduleExpression() {
      clearTimeout(this.#exprTimer);
      // 布尔属性语义：存在且非 'off' 即开启（<grok-bot auto-expression> 裸写法生效）
      const mode = this.getAttribute('auto-expression');
      if (mode === null || mode === 'off' || RINGS.length < 2) return;
      if (this.#lockExpr !== null || this.#mediaMotion.matches) return;
      const { exprMin, exprMax } = this.#stateCfg; // 换表情节奏随状态（idle 9–16s，活跃状态更快）
      const delay = exprMin + Math.random() * (exprMax - exprMin);
      this.#exprTimer = setTimeout(() => {
        if (this.#destroyed || this.#lockExpr !== null) return;
        if (!document.hidden && this.#visible) {
          this.#setRing(this.#advanceSeq(), true); // 按状态池序列轮换
          this.#wake();
        }
        this.#scheduleExpression();
      }, delay);
    }

    /* ---------- 绘制 ---------- */
    #draw(blinkScale) {
      const ctx = this.#ctx;
      const css = this.#cssSize, dpr = this.#dpr;
      const side = css;
      const s = (side / VIEWBOX) * dpr;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.#cv.width, this.#cv.height);
      ctx.setTransform(s, 0, 0, s, 0, 0);
      ctx.translate(INSET, INSET);

      const [, , , , es] = this.#shape;

      /* 身体（共享 Path2D） */
      ctx.fillStyle = this.#colors.body;
      ctx.fill(this.#prep.bodyPath);

      /* 眼睛（裁剪进身体；视线偏移 + 眨眼压缩 + 表情缩放） */
      ctx.save();
      ctx.clip(this.#prep.bodyPath);
      ctx.fillStyle = this.#colors.eye;
      const baseScale = es;
      const eyes = this.#displayed();
      const gx = clamp(this.#gaze.x, -1, 1) * GAZE_X;
      const gy = clamp(this.#gaze.y, -1, 1) * GAZE_Y;
      for (const eye of eyes) {
        ctx.save();
        ctx.translate(eye.cx + gx, eye.cy + gy);
        ctx.scale(baseScale, blinkScale * baseScale);
        ctx.translate(-eye.cx, -eye.cy);
        ctx.fill(eye.path);
        ctx.restore();
      }
      ctx.restore();
    }
  }

  function on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    return () => target.removeEventListener(type, fn, opts);
  }

  function parseExpression(attr) {
    if (attr === null || attr === 'none' || attr === '') return null;
    const byName = RING_NAMES.indexOf(attr);
    if (byName >= 0) return byName;
    const n = attr | 0;
    return n >= 0 && n < RINGS.length ? n : null;
  }

  /* ---------- 注册与命名空间 ---------- */
  if (!customElements.get('grok-bot') && RINGS !== null) {
    customElements.define('grok-bot', GrokBotElement);
  }

  const mount = (opts = {}) => {
    const host = document.createElement('grok-bot');
    const size = opts.size || 120;
    host.setAttribute('size', size);
    if (opts.shape) host.setAttribute('shape', opts.shape);
    if (opts.theme) host.setAttribute('theme', opts.theme);
    if (opts.state) host.setAttribute('state', opts.state);
    if (opts.ambient === false) host.setAttribute('ambient', 'off');
    if (opts.expression !== undefined) host.setAttribute('expression', String(opts.expression));
    if (opts.autoExpression) host.setAttribute('auto-expression', 'on');
    if (opts.tracking === false) host.setAttribute('tracking', 'off');
    if (opts.autoBlink === false) host.setAttribute('auto-blink', 'off');
    if (opts.float !== false) {
      // 水平：left 优先，否则 right（默认 20）；垂直：top 优先，否则 bottom（默认 20）
      const x = opts.left !== undefined ? 'left:' + (+opts.left || 0) + 'px;'
        : 'right:' + (+opts.right || 0) + 'px;';
      const y = opts.top !== undefined ? 'top:' + (+opts.top || 0) + 'px;'
        : 'bottom:' + (+opts.bottom || 0) + 'px;';
      host.style.cssText = 'position:fixed;' + x + y + 'width:' + size + 'px;height:' + size +
        'px;z-index:2147483000;pointer-events:auto;';
    }
    // 颜色覆盖（CSS 自定义属性，须在 cssText 之后设置）
    if (opts.bodyColor) host.style.setProperty('--grokbot-body', opts.bodyColor);
    if (opts.eyeColor) host.style.setProperty('--grokbot-eye', opts.eyeColor);
    (opts.container || document.body).appendChild(host);
    return host;
  };

  const NS = (window.__Widgets = window.__Widgets || {});
  if (!NS.grokbot) {
    NS.grokbot = { mount, version: '1.1.0' };
  }

  /* 脚本标签带 data-float 时自动挂载悬浮球（默认右下角 20px；
     可用 data-left / data-top / data-right / data-bottom 定位、
     data-body / data-eye 覆盖身体/眼睛颜色） */
  if (document.currentScript && document.currentScript.hasAttribute('data-float')) {
    const ds = document.currentScript.dataset;
    const conf = { autoExpression: true };
    for (const k of ['left', 'top', 'right', 'bottom']) {
      if (ds[k] !== undefined) conf[k] = parseFloat(ds[k]) || 0;
    }
    if (ds.body) conf.bodyColor = ds.body;
    if (ds.eye) conf.eyeColor = ds.eye;
    const boot = () => mount(conf);
    if (document.body) boot();
    else document.addEventListener('DOMContentLoaded', boot, { once: true });
  }
})();
