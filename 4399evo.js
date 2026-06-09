// ==UserScript==
// @name         4399增强
// @version      0.6.0
// @description  [✨无限资源/免广告/移除页面广告/自动签到] 集成更多增强功能
// @author       原作者dsy4567 awwwww
// @icon         http://4399.com/favicon.ico
// @run-at       document-start
// @license      MIT

// @include      *://*/*
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_setValue
// @grant        unsafeWindow

// @homepageURL  https://fcmsb250.github.io/
// @supportURL   https://github.com/dsy4567/Fucking-Anti-Indulgence/
// ==/UserScript==

(function () {
    'use strict';

    const startTime = new Date();

    // ---------- 配置存储 ----------
    const config = {
        adMultiplier: GM_getValue('AD', 1),
        ua: GM_getValue('UA', navigator.userAgent),
        delayMode: GM_getValue('延时模式') === '1',
        removePageAds: GM_getValue('移除页面广告', true),  // 新：是否移除页面广告
        autoSignIn: GM_getValue('自动签到', false)         // 新：是否自动签到
    };

    // ---------- 工具函数 ----------
    function getAdMultiplier() {
        let val = config.adMultiplier;
        const num = Number(val);
        return isNaN(num) || num === 0 ? 1 : num;
    }

    function safeCallback(callback, ...args) {
        if (typeof callback === 'function') {
            callback(...args);
        }
    }

    // ---------- 页面提示替代 alert ----------
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

    // ---------- 新功能1：移除页面广告（弹窗、横幅等） ----------
    function removePageAds() {
        if (!config.removePageAds) return;
        // 常见广告容器选择器（根据4399常见页面结构调整）
        const adSelectors = [
            // 通用类
            '.ads', '.ad', '.advertisement', '.banner-ad', '.popup-ad',
            '.gg-box', '.gg', '.ad-container', '.advert',
            // 4399特有
            '.ad_play', '#adIframe', '#adDiv', '#popup_ad',
            '.game-ad', '.float-ad', '#gg_div', '.tip_ad',
            // 弹窗广告
            '.layui-layer', '.dialog-ads', '.mask-ads'
        ];
        // 隐藏这些元素
        const style = document.createElement('style');
        style.textContent = adSelectors.join(', ') + ` {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
            height: 0 !important;
            overflow: hidden !important;
        }`;
        document.head.appendChild(style);
        console.log('[4399增强] 已注入广告隐藏样式');

        // 动态移除（每2秒扫描）
        setInterval(() => {
            adSelectors.forEach(sel => {
                document.querySelectorAll(sel).forEach(el => {
                    if (el.style.display !== 'none') {
                        el.style.display = 'none';
                        el.parentNode?.removeChild(el);
                    }
                });
            });
        }, 2000);
    }

    // ---------- 新功能2：自动签到 / 每日奖励 ----------
    function autoSignIn() {
        if (!config.autoSignIn) return;
        // 等待DOM加载完成
        const observer = new MutationObserver((mutations) => {
            // 常见签到按钮/元素
            const signInBtns = [
                document.querySelector('#signInBtn'),
                document.querySelector('.sign-in-btn'),
                document.querySelector('[data-sign="true"]'),
                document.querySelector('.checkin-btn'),
                document.querySelector('.daily-reward'),
                // 4399 某些游戏签到按钮
                document.querySelector('.vipSignBtn'),
                document.querySelector('.signBtn')
            ].filter(Boolean);

            if (signInBtns.length > 0) {
                signInBtns.forEach(btn => {
                    if (btn && !btn.dataset.autoClicked) {
                        btn.click();
                        btn.dataset.autoClicked = 'true';
                        console.log('[4399增强] 自动点击签到按钮', btn);
                        showToast('自动签到成功', 'success');
                    }
                });
                // 可以停止观察，或继续检查
            }
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: false
        });
        // 5秒后停止观察（避免无限循环）
        setTimeout(() => observer.disconnect(), 5000);
    }

    // ---------- 原有API拦截（已改进版） ----------
    const patchedObjects = new Set();

    function patchApi(apiObjName) {
        const api = unsafeWindow[apiObjName];
        if (!api || patchedObjects.has(api)) return;
        patchedObjects.add(api);

        const isH5api = apiObjName === 'h5api';
        const delayMode = config.delayMode;

        // 1. playAd
        api.playAd = function (callback) {
            const multiplier = getAdMultiplier();
            if (typeof callback !== 'function') {
                console.log('[4399增强] playAd: 无效回调');
                return;
            }
            const fireCallback = (code, msg) => {
                callback({ code, message: msg });
            };

            if (delayMode || location.href.includes('https://sda.4399.com/4399swf/upload_swf/ftp39/cwb/20220720/04/gameIndex.html')) {
                fireCallback(10000, '开始播放');
                setTimeout(() => fireCallback(10001, '播放结束'), 5000);
            } else {
                for (let i = 0; i < multiplier; i++) {
                    fireCallback(10000, '开始播放');
                    fireCallback(10001, '播放结束');
                }
                console.log(`[4399增强] 已阻止广告并发放奖励 x${multiplier}`);
            }
        };

        // 2. canPlayAd
        api.canPlayAd = function (callback) {
            if (typeof callback === 'function') {
                callback({ canPlayAd: true, remain: 99999 });
                console.log('[4399增强] canPlayAd 返回 true');
            }
            return true;
        };

        // 3. showGuide
        api.showGuide = function (callback) {
            safeCallback(callback);
            console.log('[4399增强] 专属礼包领取成功');
            showToast('专属礼包领取成功', 'success');
        };

        // 4. 防沉迷 (仅 H5API)
        if (!isH5api) {
            api.openVerify = api.verifyState = function (callback) {
                if (typeof callback === 'function') {
                    callback({
                        eventType: '_verifyState',
                        data: { needVerify: false, antiIndulge: 1 }
                    });
                    console.log('[4399增强] 已绕过防沉迷');
                }
            };
        }

        // 5. 排行榜修改 (仅 h5api)
        if (isH5api) {
            const originalSubmitRankScore = api.submitRankScore;
            api.submitRankScore = function (rankId, score, callback) {
                const userScore = prompt(
                    `您正在提交分数，请输入想要的分数 (谨慎使用)\n排行榜ID: ${rankId}`,
                    score
                );
                const finalScore = (userScore === null || userScore === '') ? score : Number(userScore);
                originalSubmitRankScore.call(api, rankId, finalScore, function (result) {
                    alert(
                        `分数提交完毕\n状态码: ${result.code}\n消息: ${result.msg}\n历史最高分数: ${result.data?.score}\n历史最高排名: ${result.data?.rank}`
                    );
                    safeCallback(callback, result);
                });
            };
        }
    }

    // ---------- 轮询启动 ----------
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

    // ---------- 菜单管理 ----------
    function updateMenu() {
        // 清除旧菜单项（避免重复）
        if (typeof rewardMenuId !== 'undefined') GM_unregisterMenuCommand(rewardMenuId);
        if (typeof uaMenuId !== 'undefined') GM_unregisterMenuCommand(uaMenuId);
        if (typeof removeAdMenuId !== 'undefined') GM_unregisterMenuCommand(removeAdMenuId);
        if (typeof signInMenuId !== 'undefined') GM_unregisterMenuCommand(signInMenuId);

        const multi = getAdMultiplier();
        const ua = config.ua;
        const removeAdLabel = config.removePageAds ? '已开启' : '已关闭';
        const signInLabel = config.autoSignIn ? '已开启' : '已关闭';

        rewardMenuId = GM_registerMenuCommand(`当前奖励倍数: ${multi}`);
        uaMenuId = GM_registerMenuCommand(`当前UA: ${ua}`);
        removeAdMenuId = GM_registerMenuCommand(`页面广告移除: ${removeAdLabel}`);
        signInMenuId = GM_registerMenuCommand(`自动签到: ${signInLabel}`);
    }

    let rewardMenuId, uaMenuId, removeAdMenuId, signInMenuId;

    // ---------- 主逻辑 ----------
    if (location.host.includes('4399')) {
        // 抵挡调试
        const noop = () => {};
        try {
            Object.defineProperty(unsafeWindow, 'check', { value: noop, writable: false });
            Object.defineProperty(unsafeWindow, 'consoleOpenCallback', { value: noop, writable: false });
            clearInterval(unsafeWindow._windon_handler);
        } catch (e) {
            console.warn('[4399增强] 无法覆盖调试函数', e);
        }

        startPolling();
        removePageAds();  // 新功能1
        autoSignIn();     // 新功能2

        // 修改UA
        const customUA = config.ua;
        if (customUA && customUA !== 'default') {
            Object.defineProperty(navigator, 'userAgent', {
                get: () => customUA,
                configurable: true,
                enumerable: true
            });
        }

        // 注册菜单
        if (self === top) {
            GM_registerMenuCommand('解决访问错误', () => location.reload());

            const delayLabel = config.delayMode ? '已启用' : '已禁用';
            GM_registerMenuCommand(`延时模式(${delayLabel})`, () => {
                const newVal = config.delayMode ? '0' : '1';
                GM_setValue('延时模式', newVal);
                location.reload();
            });

            GM_registerMenuCommand('修改UA为4399在线玩', () => {
                GM_setValue('UA', '4399wan');
                config.ua = '4399wan';
                updateMenu();
            });
            GM_registerMenuCommand('修改UA为4399游戏盒广场', () => {
                GM_setValue('UA', '4399GameCenter minigame');
                config.ua = '4399GameCenter minigame';
                updateMenu();
            });
            GM_registerMenuCommand('修改UA为默认', () => {
                GM_setValue('UA', 'default');
                config.ua = navigator.userAgent;
                updateMenu();
            });

            GM_registerMenuCommand('1倍激励广告奖励', () => {
                GM_setValue('AD', '1');
                config.adMultiplier = 1;
                updateMenu();
            });
            GM_registerMenuCommand('1000倍激励广告奖励(不建议)', () => {
                GM_setValue('AD', '1000');
                config.adMultiplier = 1000;
                updateMenu();
            });
            GM_registerMenuCommand('自定义激励广告奖励倍数', () => {
                const inp = prompt('请输入数字（过大可能导致卡顿）', getAdMultiplier());
                if (inp === null) return;
                const num = Number(inp);
                if (isNaN(num) || num === 0) {
                    alert('无效数字');
                    return;
                }
                GM_setValue('AD', String(num));
                config.adMultiplier = num;
                updateMenu();
            });

            // 新功能菜单：切换页面广告移除
            GM_registerMenuCommand('切换页面广告移除', () => {
                config.removePageAds = !config.removePageAds;
                GM_setValue('移除页面广告', config.removePageAds);
                updateMenu();
                if (config.removePageAds) {
                    removePageAds();
                    showToast('页面广告移除已开启', 'success');
                } else {
                    showToast('页面广告移除已关闭', 'warning');
                }
            });

            // 新功能菜单：切换自动签到
            GM_registerMenuCommand('切换自动签到', () => {
                config.autoSignIn = !config.autoSignIn;
                GM_setValue('自动签到', config.autoSignIn);
                updateMenu();
                if (config.autoSignIn) {
                    autoSignIn();
                    showToast('自动签到已开启', 'success');
                } else {
                    showToast('自动签到已关闭', 'warning');
                }
            });

            // 初始化菜单
            updateMenu();
        }
    } else {
        // 非4399域名也尝试拦截（某些游戏可能跨域引用API）
        startPolling();
        // 但页面广告移除和自动签到仅在4399域名时启用更合理，此处根据情况也可以启用
        if (config.removePageAds) removePageAds();
        if (config.autoSignIn) autoSignIn();
    }

    console.log(`[4399增强] 脚本执行完毕，耗时 ${new Date() - startTime}ms , 功能状态:`, {
        奖励倍数: getAdMultiplier(),
        UA: config.ua,
        延时模式: config.delayMode,
        移除页面广告: config.removePageAds,
        自动签到: config.autoSignIn
    });
})();
