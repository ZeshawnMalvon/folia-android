// src/utils/uiZoom.ts
// 界面缩放（#1264）的挡位：主窗口整页按固定的几个百分比缩放，关掉就是 100%。

/** 可选的挡位（百分比）。100% 不在里面：关掉开关就是 100%。 */
export const UI_ZOOM_STEPS = [50, 67, 75, 80, 90, 110, 125, 150] as const;

export type UiZoomStep = typeof UI_ZOOM_STEPS[number];

/** 第一次打开开关时用的挡位：系统缩放调得大、界面显得挤，多半是想缩小一点。 */
export const DEFAULT_UI_ZOOM_STEP: UiZoomStep = 80;

/** 存着的值读成一个挡位；不是挡位（旧值、手改的值）时为 null。 */
export const readUiZoomStep = (value: unknown): UiZoomStep | null => {
    const percent = typeof value === 'number' ? value : Number(value);
    return (UI_ZOOM_STEPS as readonly number[]).includes(percent) ? percent as UiZoomStep : null;
};

/** 开关和挡位合成页面的缩放倍数。 */
export const resolveUiZoomFactor = (enabled: boolean, step: UiZoomStep): number => (enabled ? step / 100 : 1);

/**
 * 页面此刻的界面缩放倍率（runtime 写在 <html> 上的 --folia-ui-zoom；没开缩放或没装 CSS 通道时为 1）。
 *
 * CSS zoom 开着时 getBoundingClientRect 给的坐标乘过倍率，而 offsetWidth/clientLeft 这类盒模型
 * 属性没有；portal 出去的浮层用 fixed/absolute 定位，left/top 这些值还会被 zoom 再乘一次——
 * 拿矩形直接定位会落偏。凡是给 portal 浮层算位置的，先用 getUiZoomMapping 取换算系数。
 */
export const getUiZoomFactor = (): number => {
    if (typeof document === 'undefined') return 1;
    const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--folia-ui-zoom'));
    return Number.isFinite(value) && value > 0 ? value : 1;
};

/** 给 portal 浮层算位置用的坐标换算系数（都是乘法系数；没开缩放时都是 1）。 */
export interface UiZoomMapping {
    /** getBoundingClientRect 的坐标值 → 未缩放 CSS 像素。 */
    readonly rectToCss: number;
    /** window.innerWidth / innerHeight（视觉像素）→ 未缩放 CSS 像素。 */
    readonly viewportToCss: number;
}

const IDENTITY_MAPPING: UiZoomMapping = { rectToCss: 1, viewportToCss: 1 };

let cachedMapping: { zoom: number; mapping: UiZoomMapping } | null = null;

/**
 * 实测当前缩放下的坐标换算系数。
 *
 * 不同 WebView 版本对 CSS zoom 的实现不一样（gBCR 是否已乘倍率、fixed 定位值是否再乘），猜会猜错，
 * 所以放两个探针量出真实映射：一个铺满视口的 fixed 探针，视觉高度就是 innerHeight，它的 gBCR 高度
 * 由此给出「gBCR 单位 → 视觉像素」的比例；一个 100px 高的 fixed 探针，其 gBCR 高度乘上前一个比例
 * 就是「CSS 像素 → 视觉像素」的倍率。结果按倍率缓存，倍率变了（换挡位、开关缩放）才重测。
 */
export const getUiZoomMapping = (): UiZoomMapping => {
    if (typeof document === 'undefined' || !document.body) return IDENTITY_MAPPING;
    const zoom = getUiZoomFactor();
    if (zoom === 1) return IDENTITY_MAPPING;
    if (cachedMapping?.zoom === zoom) return cachedMapping.mapping;

    const fallback: UiZoomMapping = { rectToCss: 1 / zoom, viewportToCss: 1 / zoom };
    let mapping = fallback;
    try {
        const probeFull = document.createElement('div');
        probeFull.setAttribute('aria-hidden', 'true');
        probeFull.style.cssText = 'position:fixed;inset:0;visibility:hidden;pointer-events:none;';
        const probeFixed = document.createElement('div');
        probeFixed.setAttribute('aria-hidden', 'true');
        probeFixed.style.cssText = 'position:fixed;top:0;left:0;height:100px;width:1px;visibility:hidden;pointer-events:none;';
        document.body.append(probeFull, probeFixed);
        const fullHeight = probeFull.getBoundingClientRect().height;
        const fixedHeight = probeFixed.getBoundingClientRect().height;
        probeFull.remove();
        probeFixed.remove();

        // 铺满视口的探针：视觉高度恒等于 innerHeight，gBCR 高度 = 视觉高度 / rectScale。
        const rectScale = fullHeight > 1 ? window.innerHeight / fullHeight : 0;
        // 100px 高的探针：视觉高度 = 100 × cssScale，gBCR 高度 = 视觉高度 / rectScale。
        const cssScale = rectScale > 0 && fixedHeight > 0 ? (fixedHeight * rectScale) / 100 : 0;
        if (rectScale > 0 && cssScale > 0) {
            mapping = { rectToCss: rectScale / cssScale, viewportToCss: 1 / cssScale };
            console.info(`[UiZoom] measured mapping at ${Math.round(zoom * 100)}%:`, mapping);
        }
    } catch {
        mapping = fallback;
    }
    cachedMapping = { zoom, mapping };
    return mapping;
};

/**
 * 放大或缩小一挡后的开关和挡位。100% 夹在 90% 和 110% 之间，走到它就是关掉开关（挡位留着，
 * 下次打开还是它）；已经在最大或最小一挡时为 null。
 */
export const stepUiZoom = (
    enabled: boolean,
    step: UiZoomStep,
    direction: 1 | -1,
): { enabled: boolean; step: UiZoomStep } | null => {
    const ladder = [...UI_ZOOM_STEPS, 100].sort((a, b) => a - b);
    const index = ladder.indexOf(enabled ? step : 100) + direction;
    if (index < 0 || index >= ladder.length) return null;
    const next = ladder[index];
    return next === 100 ? { enabled: false, step } : { enabled: true, step: next as UiZoomStep };
};
