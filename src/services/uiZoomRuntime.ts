import { useDesktopSettingsStore } from '../stores/useDesktopSettingsStore';
import { resolveUiZoomFactor } from '../utils/uiZoom';
import { IS_ANDROID_WEBVIEW } from '../utils/platform';

// src/services/uiZoomRuntime.ts
// 界面缩放（#1264）套到主窗口上：启动时在首屏渲染前套一次，之后跟着设置改。只在桌面版的主窗口装
// （bootstrap.tsx）；遥控窗口尺寸固定，不缩放。
// 安卓壳（Capacitor WebView）没有 Electron 的 page zoom 桥，退而用 <html> 上的 CSS zoom：同样是
// 整页缩放，WebView 的 Chromium 内核原生支持。浏览器网页版没有设置入口，保持不装。

let installed = false;

/** 按当前设置缩放这个窗口，并在开关或挡位改动时跟着改。 */
export const installUiZoom = () => {
    if (installed) return;
    const electron = window.electron;
    if (electron?.setPageZoomFactor) {
        installed = true;
        // 和窗口现在的缩放比，不和上次设的比：默认菜单的 Ctrl+=/-/0 会绕过设置改掉它，再选一次同一挡要能改回来。
        // 启动时也一样：同源页面按源记着的缩放（例如以前按过 Ctrl+-）不一样就盖掉。
        const apply = (enabled: boolean, step: Parameters<typeof resolveUiZoomFactor>[1]) => {
            const factor = resolveUiZoomFactor(enabled, step);
            if (Math.abs(electron.getPageZoomFactor() - factor) < 0.001) return;
            electron.setPageZoomFactor(factor);
            console.info(`[UiZoom] page zoom ${Math.round(factor * 100)}%`);
        };
        const initial = useDesktopSettingsStore.getState();
        apply(initial.uiZoomEnabled, initial.uiZoomStep);
        useDesktopSettingsStore.subscribe(state => apply(state.uiZoomEnabled, state.uiZoomStep));
        return;
    }
    // 安卓壳：Electron 桥不存在，用 CSS zoom 兜底。浏览器网页版仍然什么也不做。
    if (!IS_ANDROID_WEBVIEW) return;
    installed = true;
    const apply = (enabled: boolean, step: Parameters<typeof resolveUiZoomFactor>[1]) => {
        const factor = resolveUiZoomFactor(enabled, step);
        const htmlStyle = document.documentElement.style;
        const current = Number.parseFloat(htmlStyle.getPropertyValue('zoom')) || 1;
        if (Math.abs(current - factor) < 0.001) return;
        htmlStyle.setProperty('zoom', factor === 1 ? '' : String(factor));
        // CSS zoom 会把 vh/dvh 再乘一次缩放倍率（Electron 的页面缩放不会），布局里凡是按视口
        // 定高的窗口（设置、命令面板等）都改成除以这个变量来抵消，见各组件里的 calc(...)。
        htmlStyle.setProperty('--folia-ui-zoom', String(factor));
        console.info(`[UiZoom] css zoom ${Math.round(factor * 100)}%`);
    };
    const initial = useDesktopSettingsStore.getState();
    apply(initial.uiZoomEnabled, initial.uiZoomStep);
    useDesktopSettingsStore.subscribe(state => apply(state.uiZoomEnabled, state.uiZoomStep));
};
