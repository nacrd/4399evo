// ==UserScript==
// @name         4399增强
// @version      0.7.0
// @description  
// @author       awwwwwwww 原作者github@dsy4567
// @icon         http://4399.com/favicon.ico
// @run-at       document-start
// @license      MIT

// @match        *://*.4399.com/*
// @match        *://4399.com/*
// @include      *://*/*
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow

// @homepageURL  https://github.com/nacrd/4399evo
// @supportURL   https://github.com/nacrd/4399evo
// ==/UserScript==

(function () {
    'use strict';

    const startTime = Date.now();

    // ---------- 配置存储 ----------
    const config = {
        adMultiplier: Number(GM_getValue('AD', 1)),   // 确保为数字
        ua: GM_getValue('UA', navigator.userAgent),
        delayMode: GM_getValue('延时模式') === '1',
        removePageAds: GM_getValue('移除页面广告', true),
        autoSignIn: GM_getValue('自动签到', false),
        autoCheckUpdate: GM_getValue('自动检查更新', true),
        updateCheckUrl: GM_getValue('更新检查地址', 'https://raw.githubusercontent.com/nacrd/4399evo/main/4399%E5%A2%9E%E5%BC%BA.user.js')
    };

    const CURRENT_VERSION = GM_info.script.version;

    // ---------- 动态菜单管理 ----------
    let dynamicMenuIds = [];
    function clearDynamicMenus() {
        dynamicMenuIds.forEach(id => {
            try { GM_unregisterMenuCommand(id); } catch (e) { /* ignore */ }
        });
        dynamicMenuIds = [];
    }
    function registerDynamicMenu(label, onClick) {
        const id = GM_registerMenuCommand(label, onClick);
        dynamicMenuIds.push(id);
        return id;
    }

    // ---------- 工具函数 ----------
    const getAdMultiplier = () => {
        const num = Number(config.adMultiplier);
        return isNaN(num) || num === 0 ? 1 : num;
    };

    const safeCallback = (callback, ...args) => {
        if (typeof callback === 'function') callback(...args);
    };

    function showToast(msg, type = 'info') {
        const colors = {
            info: '#2196F3',
            success: '#4CAF50',
            error: '#f44336',
            warning: '#FF9800'
        };
        const div = document.createElement('div');
        div.textContent = msg;
        div.style.cssText = `
            position: fixed; top: 20px; right: 20px;
            background: ${colors[type] || colors.info}; color: white; padding: 12px 18px;
            border-radius: 6px; z-index: 99999;
            box-shadow: 0 4px 8px rgba(0,0,0,0.3);
            font-size: 14px; font-weight: bold;
            transition: opacity 0.5s;
            max-width: 400px; word-break: break-word;
        `;
        document.body.appendChild(div);
        setTimeout(() => {
            div.style.opacity = '0';
            setTimeout(() => div.remove(), 600);
        }, 3000);
    }

    // ---------- 功能1：移除页面广告 ----------
    let adObserver = null;
    function removePageAds() {
        if (!config.removePageAds) return;

        const adSelectors = [
            '.ads', '.ad', '.advertisement', '.banner-ad', '.popup-ad',
            '.gg-box', '.gg', '.ad-container', '.advert',
            '.ad_play', '#adIframe', '#adDiv', '#popup_ad',
            '.game-ad', '.float-ad', '#gg_div', '.tip_ad',
            '.layui-layer', '.dialog-ads', '.mask-ads'
        ];

        if (!document.getElementById('adBlockStyle')) {
            const style = document.createElement('style');
            style.id = 'adBlockStyle';
            style.textContent = adSelectors.join(', ') + ` {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                pointer-events: none !important;
                height: 0 !important;
                overflow: hidden !important;
            }`;
            document.head.appendChild(style);
        }

        if (adObserver) adObserver.disconnect();
        adObserver = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType !== 1) return;
                    for (const sel of adSelectors) {
                        if (node.matches?.(sel)) {
                            node.remove();
                            break;
                        }
                        if (node.querySelectorAll) {
                            node.querySelectorAll(sel).forEach(el => el.remove());
                        }
                    }
                });
            }
        });
        try {
            adObserver.observe(document.body, { childList: true, subtree: true });
            console.log('[4399增强] 广告移除已启用（Observer 模式）');
        } catch (e) {
            console.warn('[4399增强] Observer 启动失败，改用轮询', e);
            setInterval(() => {
                adSelectors.forEach(sel => {
                    document.querySelectorAll(sel).forEach(el => el.remove());
                });
            }, 2000);
        }
    }

    // ---------- 功能2：自动签到 ----------
    let signInObserver = null;
    function autoSignIn() {
        if (!config.autoSignIn) return;

        const signInSelectors = [
            '#signInBtn', '.sign-in-btn', '[data-sign="true"]',
            '.checkin-btn', '.daily-reward', '.vipSignBtn', '.signBtn'
        ];

        if (signInObserver) signInObserver.disconnect();
        signInObserver = new MutationObserver((mutations, obs) => {
            for (const sel of signInSelectors) {
                const btn = document.querySelector(sel);
                if (btn && !btn.dataset.autoClicked) {
                    btn.click();
                    btn.dataset.autoClicked = 'true';
                    console.log('[4399增强] 自动签到完成', btn);
                    showToast('自动签到成功', 'success');
                    obs.disconnect();
                    return;
                }
            }
        });
        try {
            signInObserver.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => {
                if (signInObserver) {
                    signInObserver.disconnect();
                    signInObserver = null;
                }
            }, 10000);
        } catch (e) {
            console.warn('[4399增强] 签到观察器启动失败', e);
        }
    }

    // ---------- API 拦截 ----------
    const patchedObjects = new WeakSet();

    function patchApi(apiObjName) {
        const api = unsafeWindow[apiObjName];
        if (!api || patchedObjects.has(api)) return;
        patchedObjects.add(api);

        const isH5api = apiObjName === 'h5api';
        const delayMode = config.delayMode;

        api.playAd = function (callback) {
            const multiplier = getAdMultiplier();
            if (typeof callback !== 'function') return;

            const fireCallback = (code, msg) => {
                try { callback({ code, message: msg }); } catch (e) { /* ignore */ }
            };

            if (delayMode || location.href.includes('https://sda.4399.com/4399swf/upload_swf/ftp39/cwb/20220720/04/gameIndex.html')) {
                fireCallback(10000, '开始播放');
                setTimeout(() => fireCallback(10001, '播放结束'), 5000);
            } else {
                let count = 0;
                const maxPerFrame = 5;
                const process = () => {
                    const batch = Math.min(maxPerFrame, multiplier - count);
                    for (let i = 0; i < batch; i++) {
                        fireCallback(10000, '开始播放');
                        fireCallback(10001, '播放结束');
                    }
                    count += batch;
                    if (count < multiplier) {
                        requestAnimationFrame(process);
                    } else {
                        console.log(`[4399增强] 已阻止广告并发放奖励 x${multiplier}`);
                    }
                };
                if (multiplier > 0) process();
            }
        };

        api.canPlayAd = function (callback) {
            safeCallback(callback, { canPlayAd: true, remain: 99999 });
            console.log('[4399增强] canPlayAd 返回 true');
            return true;
        };

        api.showGuide = function (callback) {
            safeCallback(callback);
            console.log('[4399增强] 专属礼包领取成功');
            showToast('专属礼包领取成功', 'success');
        };

        if (!isH5api) {
            api.openVerify = api.verifyState = function (callback) {
                safeCallback(callback, {
                    eventType: '_verifyState',
                    data: { needVerify: false, antiIndulge: 1 }
                });
                console.log('[4399增强] 已绕过防沉迷');
            };
        }

        if (isH5api) {
            const originalSubmitRankScore = api.submitRankScore;
            api.submitRankScore = function (rankId, score, callback) {
                const userScore = prompt(
                    `您正在提交分数，请输入想要的分数 (谨慎使用)\n排行榜ID: ${rankId}`,
                    score
                );
                const finalScore = userScore === null || userScore === '' ? score : Number(userScore);
                originalSubmitRankScore.call(api, rankId, finalScore, function (result) {
                    alert(
                        `分数提交完毕\n状态码: ${result.code}\n消息: ${result.msg}\n历史最高分数: ${result.data?.score}\n历史最高排名: ${result.data?.rank}`
                    );
                    safeCallback(callback, result);
                });
            };
        }
    }

    let pollingStarted = false;
    function startPolling() {
        if (pollingStarted) return;
        pollingStarted = true;
        patchApi('h5api');
        patchApi('H5API');
        setInterval(() => {
            patchApi('h5api');
            patchApi('H5API');
        }, 5000);
    }

    // ---------- 更新检测 ----------
    function checkForUpdate(silent = false) {
        const url = config.updateCheckUrl;
        if (!url) {
            !silent && showToast('未设置更新检查地址', 'warning');
            return;
        }

        GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            timeout: 10000,
            onload: function(response) {
                if (response.status !== 200) {
                    !silent && showToast(`检查更新失败: HTTP ${response.status}`, 'error');
                    return;
                }
                const text = response.responseText;
                const versionMatch = text.match(/\/\/\s*@version\s+([\d.]+)/);
                if (!versionMatch) {
                    !silent && showToast('无法解析远程版本号', 'error');
                    return;
                }
                const remoteVersion = versionMatch[1];
                console.log(`[4399增强] 远程版本: ${remoteVersion}, 本地版本: ${CURRENT_VERSION}`);

                if (compareVersions(remoteVersion, CURRENT_VERSION) > 0) {
                    showToast(`发现新版本 ${remoteVersion}，请前往更新！`, 'warning');
                    GM_setValue('lastKnownVersion', remoteVersion);
                } else if (!silent) {
                    showToast('已是最新版本', 'success');
                }
            },
            onerror: function() {
                !silent && showToast('检查更新失败，网络错误', 'error');
            }
        });
    }

    function compareVersions(v1, v2) {
        const parts1 = v1.split('.').map(Number);
        const parts2 = v2.split('.').map(Number);
        for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
            const a = parts1[i] || 0;
            const b = parts2[i] || 0;
            if (a > b) return 1;
            if (a < b) return -1;
        }
        return 0;
    }

    let updateCheckTimer = null;
    function startAutoUpdateCheck() {
        stopAutoUpdateCheck();
        if (!config.autoCheckUpdate) return;
        const now = Date.now();
        const lastCheck = Number(GM_getValue('lastUpdateCheck', 0));
        const oneDay = 24 * 60 * 60 * 1000;

        if (now - lastCheck > oneDay) {
            checkForUpdate(true);
            GM_setValue('lastUpdateCheck', now);
        }
        updateCheckTimer = setInterval(() => {
            checkForUpdate(true);
            GM_setValue('lastUpdateCheck', Date.now());
        }, oneDay);
    }

    function stopAutoUpdateCheck() {
        if (updateCheckTimer) {
            clearInterval(updateCheckTimer);
            updateCheckTimer = null;
        }
    }

    // ---------- 菜单更新 ----------
    function updateMenu() {
        clearDynamicMenus();

        const multi = getAdMultiplier();
        const ua = config.ua;
        const removeAdLabel = config.removePageAds ? '已开启' : '已关闭';
        const signInLabel = config.autoSignIn ? '已开启' : '已关闭';
        const autoUpdateLabel = config.autoCheckUpdate ? '已开启' : '已关闭';

        registerDynamicMenu(`当前倍数: ${multi}`, () => {});
        registerDynamicMenu(`UA: ${ua === 'default' ? '浏览器默认' : ua}`, () => {});
        registerDynamicMenu(`广告移除: ${removeAdLabel}`, () => {});
        registerDynamicMenu(`自动签到: ${signInLabel}`, () => {});
        registerDynamicMenu(`自动更新: ${autoUpdateLabel}`, () => {});
    }

    // ---------- 菜单分组（设置面板） ----------
    function showSettingsPanel() {
        const options = [
            `1. 延时模式 (当前: ${config.delayMode ? '开启' : '关闭'})`,
            `2. 广告移除 (当前: ${config.removePageAds ? '开启' : '关闭'})`,
            `3. 自动签到 (当前: ${config.autoSignIn ? '开启' : '关闭'})`,
            `4. 自动更新 (当前: ${config.autoCheckUpdate ? '开启' : '关闭'})`,
            `5. UA 设置 (当前: ${config.ua === 'default' ? '浏览器默认' : config.ua})`,
            `6. 奖励倍数 (当前: ${getAdMultiplier()})`,
            `7. 立即检查更新`,
            `8. 设置更新检查地址`,
            `9. 刷新页面（使部分设置生效）`,
            `0. 退出`
        ];
        const choice = prompt(
            '⚙️ 功能设置面板\n输入序号进行操作：\n\n' + options.join('\n')
        );
        if (choice === null) return;

        switch (choice.trim()) {
            case '1':
                config.delayMode = !config.delayMode;
                GM_setValue('延时模式', config.delayMode ? '1' : '0');
                showToast(`延时模式已${config.delayMode ? '开启' : '关闭'}，立即刷新`, 'success');
                location.reload();
                break;
            case '2':
                config.removePageAds = !config.removePageAds;
                GM_setValue('移除页面广告', config.removePageAds);
                if (config.removePageAds) {
                    removePageAds();
                    showToast('广告移除已开启', 'success');
                } else {
                    if (adObserver) adObserver.disconnect();
                    const style = document.getElementById('adBlockStyle');
                    if (style) style.remove();
                    showToast('广告移除已关闭', 'warning');
                }
                updateMenu();
                break;
            case '3':
                config.autoSignIn = !config.autoSignIn;
                GM_setValue('自动签到', config.autoSignIn);
                if (config.autoSignIn) {
                    autoSignIn();
                    showToast('自动签到已开启', 'success');
                } else {
                    if (signInObserver) signInObserver.disconnect();
                    showToast('自动签到已关闭', 'warning');
                }
                updateMenu();
                break;
            case '4':
                config.autoCheckUpdate = !config.autoCheckUpdate;
                GM_setValue('自动检查更新', config.autoCheckUpdate);
                if (config.autoCheckUpdate) {
                    startAutoUpdateCheck();
                    showToast('自动更新检查已开启', 'success');
                } else {
                    stopAutoUpdateCheck();
                    showToast('自动更新检查已关闭', 'warning');
                }
                updateMenu();
                break;
            case '5':
                showUASettings();
                break;
            case '6':
                showMultiplierSettings();
                break;
            case '7':
                checkForUpdate(false);
                break;
            case '8':
                const newUrl = prompt('请输入脚本 raw 文件地址', config.updateCheckUrl);
                if (newUrl !== null) {
                    GM_setValue('更新检查地址', newUrl);
                    config.updateCheckUrl = newUrl;
                    showToast('更新地址已设置', 'success');
                }
                break;
            case '9':
                location.reload();
                break;
            case '0':
                break;
            default:
                showToast('无效的选项', 'error');
        }
    }

    function showUASettings() {
        const choice = prompt(
            '选择 UA 类型：\n1. 4399在线玩\n2. 4399游戏盒广场\n3. 浏览器默认\n当前: ' + (config.ua === 'default' ? '默认' : config.ua),
            '1'
        );
        if (choice === null) return;
        switch (choice.trim()) {
            case '1':
                GM_setValue('UA', '4399wan');
                config.ua = '4399wan';
                showToast('UA 已设为 4399在线玩', 'success');
                break;
            case '2':
                GM_setValue('UA', '4399GameCenter minigame');
                config.ua = '4399GameCenter minigame';
                showToast('UA 已设为 4399游戏盒广场', 'success');
                break;
            case '3':
                GM_setValue('UA', 'default');
                config.ua = navigator.userAgent;
                showToast('UA 已恢复默认', 'success');
                break;
            default:
                showToast('无效选项', 'error');
        }
        updateMenu();
    }

    function showMultiplierSettings() {
        const choice = prompt(
            `当前广告奖励倍数: ${getAdMultiplier()}\n\n输入新倍数（过大可能导致卡顿，建议 1~100）`,
            getAdMultiplier()
        );
        if (choice === null) return;
        const num = Number(choice);
        if (isNaN(num) || num <= 0) {
            showToast('无效数字', 'error');
            return;
        }
        GM_setValue('AD', String(num));
        config.adMultiplier = num;   // 保证 config 中为数字
        updateMenu();
        showToast(`奖励倍数已设为 ${num}，下次广告生效`, 'success');
    }

    // ---------- 主逻辑 ----------
    const is4399 = location.host.includes('4399');

    if (is4399) {
        const noop = () => {};
        try {
            Object.defineProperty(unsafeWindow, 'check', { value: noop, writable: false });
            Object.defineProperty(unsafeWindow, 'consoleOpenCallback', { value: noop, writable: false });
            clearInterval(unsafeWindow._windon_handler);
        } catch (e) {}

        startPolling();

        try { removePageAds(); } catch (e) { console.warn('广告移除初始化失败', e); }
        try { autoSignIn(); } catch (e) { console.warn('签到初始化失败', e); }

        const customUA = config.ua;
        if (customUA && customUA !== 'default') {
            Object.defineProperty(navigator, 'userAgent', {
                get: () => customUA,
                configurable: true,
                enumerable: true
            });
        }

        if (self === top) {
            const initMenus = () => {
                if (initMenus.done) return;
                initMenus.done = true;

                GM_registerMenuCommand('⚙️ 功能设置面板', showSettingsPanel);
                GM_registerMenuCommand('🔄 解决访问错误', () => location.reload());
                GM_registerMenuCommand('🔍 立即检查更新', () => checkForUpdate(false));

                updateMenu();
                startAutoUpdateCheck();
            };

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', initMenus);
            } else {
                initMenus();
            }
        }
    } else {
        startPolling();
    }

    console.log(`[4399增强] 脚本就绪，耗时 ${Date.now() - startTime}ms`);
})();
