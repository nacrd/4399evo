// ==UserScript==
// @name         4399增强
// @version      0.7.1
// @description  4399 页面增强：激励奖励倍数、移除页面广告、自动签到、切换 UA、检查更新
// @author       awwwwwwww 原作者github@dsy4567
// @icon         http://4399.com/favicon.ico
// @run-at       document-start
// @license      MIT

// @match        *://*.4399.com/*
// @match        *://4399.com/*
// @include      *://*/*
// 游戏页不一定在 4399.com，H5 API 需要在任意页面挂钩（沿用原脚本）

// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_info
// @grant        unsafeWindow
// @connect      raw.githubusercontent.com
// @connect      *

// @homepage  https://github.com/nacrd/4399evo
// @support   https://github.com/nacrd/4399evo
// ==/UserScript==

// 基于 dsy4567 的《4399增强》继续维护：
// https://greasyfork.org/zh-CN/users/822325
// https://github.com/dsy4567

(function () {
    'use strict';

    const LOG = '[4399增强]';
    const startTime = Date.now();
    const pageWindow = typeof unsafeWindow === 'undefined' ? window : unsafeWindow;
    const HOOK = Symbol('4399evo.hook');
    const API_NAMES = ['h5api', 'H5API'];
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const AD_DELAY_MS = 5000;
    const FORCE_DELAY_SNIPPET = '4399swf/upload_swf/ftp39/cwb/20220720/04/gameIndex.html';
    const DEFAULT_UPDATE_URL = 'https://raw.githubusercontent.com/nacrd/4399evo/main/4399evo.user.js';
    const LEGACY_UPDATE_URLS = new Set([
        'https://raw.githubusercontent.com/nacrd/4399evo/main/4399%E5%A2%9E%E5%BC%BA.user.js',
        'https://raw.githubusercontent.com/nacrd/4399evo/main/4399增强.user.js'
    ]);
    const AD_SELECTORS = [
        '.ads', '.ad', '.advertisement', '.banner-ad', '.popup-ad',
        '.gg-box', '.gg', '.ad-container', '.advert',
        '.ad_play', '#adIframe', '#adDiv', '#popup_ad',
        '.game-ad', '.float-ad', '#gg_div', '.tip_ad',
        '.layui-layer', '.dialog-ads', '.mask-ads'
    ];
    const AD_SELECTOR = AD_SELECTORS.join(', ');
    const SIGN_IN_SELECTORS = [
        '#signInBtn', '.sign-in-btn', '[data-sign="true"]',
        '.checkin-btn', '.daily-reward', '.vipSignBtn', '.signBtn'
    ];

    const nativeUserAgent = navigator.userAgent;
    const CURRENT_VERSION = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '0.7.1';

    function readValue(key, fallback) {
        try {
            return GM_getValue(key, fallback);
        } catch (e) {
            console.warn(LOG, '读取配置失败', key, e);
            return fallback;
        }
    }

    function saveValue(key, value, interactive) {
        try {
            GM_setValue(key, value);
            return true;
        } catch (e) {
            console.warn(LOG, '保存配置失败', key, e);
            if (interactive !== false) showToast('设置保存失败', 'error');
            return false;
        }
    }

    function readUpdateUrl() {
        const stored = readValue('更新检查地址', DEFAULT_UPDATE_URL);
        if (!stored || LEGACY_UPDATE_URLS.has(stored)) {
            if (stored !== DEFAULT_UPDATE_URL) saveValue('更新检查地址', DEFAULT_UPDATE_URL, false);
            return DEFAULT_UPDATE_URL;
        }
        return stored;
    }

    const config = {
        adMultiplier: Number(readValue('AD', 1)),
        ua: readValue('UA', null),
        delayMode: readValue('延时模式') === '1',
        removePageAds: readValue('移除页面广告', true),
        autoSignIn: readValue('自动签到', false),
        autoCheckUpdate: readValue('自动检查更新', true),
        updateCheckUrl: readUpdateUrl()
    };
    if (config.ua == null) config.ua = nativeUserAgent;

    let dynamicMenuIds = [];
    function clearDynamicMenus() {
        dynamicMenuIds.forEach(id => {
            try { GM_unregisterMenuCommand(id); } catch (e) { /* 菜单可能已不存在 */ }
        });
        dynamicMenuIds = [];
    }
    function registerDynamicMenu(label, onClick) {
        const id = GM_registerMenuCommand(label, onClick);
        dynamicMenuIds.push(id);
        return id;
    }

    function getAdMultiplier() {
        const num = Number(config.adMultiplier);
        return Number.isFinite(num) && num > 0 ? num : 1;
    }

    function safeCallback(callback, ...args) {
        if (typeof callback !== 'function') return;
        try {
            callback(...args);
        } catch (e) {
            console.warn(LOG, '回调异常', e);
        }
    }

    function whenBody(fn) {
        let done = false;
        let obs = null;
        const finish = () => {
            if (obs) {
                obs.disconnect();
                obs = null;
            }
        };
        const run = () => {
            if (done || !document.body) return;
            done = true;
            finish();
            try { fn(); } catch (e) { console.warn(LOG, 'DOM 回调失败', e); }
        };
        if (document.body) {
            run();
            return;
        }
        document.addEventListener('DOMContentLoaded', () => {
            if (!document.body) finish();
            else run();
        }, { once: true });
        const root = document.documentElement;
        if (root && typeof MutationObserver === 'function') {
            obs = new MutationObserver(() => run());
            try { obs.observe(root, { childList: true }); } catch (e) { finish(); }
        }
    }

    function showToast(msg, type) {
        const mount = () => {
            if (!document.body) return;
            const colors = {
                info: '#2196F3',
                success: '#4CAF50',
                error: '#f44336',
                warning: '#FF9800'
            };
            const div = document.createElement('div');
            div.className = 'evo-toast';
            div.setAttribute('role', 'status');
            const text = String(msg);
            div.textContent = text.length > 300 ? text.slice(0, 300) + '…' : text;
            const index = document.querySelectorAll('.evo-toast').length;
            div.style.cssText = `
                position: fixed; top: ${20 + index * 56}px; right: 20px;
                background: ${colors[type] || colors.info}; color: white; padding: 12px 18px;
                border-radius: 6px; z-index: 2147483647;
                box-shadow: 0 4px 8px rgba(0,0,0,0.3);
                font-size: 14px; font-weight: bold; font-family: sans-serif;
                transition: opacity 0.5s;
                max-width: 400px; word-break: break-word;
                pointer-events: none;
            `;
            document.body.appendChild(div);
            setTimeout(() => {
                div.style.opacity = '0';
                setTimeout(() => div.remove(), 600);
            }, 3000);
        };
        if (document.body) mount();
        else whenBody(mount);
    }

    function onOff(flag) {
        return flag ? '已开启' : '已关闭';
    }

    function stateWord(flag) {
        return flag ? '开启' : '关闭';
    }

    function uaLabel(ua) {
        return !ua || ua === 'default' ? '浏览器默认' : ua;
    }

    // ---------- 功能1：移除页面广告 ----------
    let adObserver = null;
    let adStripTimer = null;
    let adPollTimer = null;
    let adGeneration = 0;

    function clearAdTimers() {
        if (adStripTimer) {
            clearTimeout(adStripTimer);
            adStripTimer = null;
        }
        if (adPollTimer) {
            clearInterval(adPollTimer);
            adPollTimer = null;
        }
        if (adObserver) {
            adObserver.disconnect();
            adObserver = null;
        }
    }

    function stopAdRemoval() {
        adGeneration++;
        clearAdTimers();
        const style = document.getElementById && document.getElementById('adBlockStyle');
        if (style) style.remove();
    }

    function removeAdElement(el) {
        if (!el || el === document.body || el === document.documentElement || el === document.head) return;
        try { el.remove(); } catch (e) { /* 节点可能已被页面移除 */ }
    }

    function stripAds() {
        try {
            document.querySelectorAll(AD_SELECTOR).forEach(removeAdElement);
        } catch (e) {
            AD_SELECTORS.forEach(sel => {
                try { document.querySelectorAll(sel).forEach(removeAdElement); } catch (err) { /* 跳过无效选择器 */ }
            });
        }
    }

    function injectAdStyle() {
        if (document.getElementById && document.getElementById('adBlockStyle')) return true;
        const parent = document.head || document.documentElement;
        if (!parent) return false;
        const style = document.createElement('style');
        style.id = 'adBlockStyle';
        style.textContent = AD_SELECTOR + ` {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
            height: 0 !important;
            overflow: hidden !important;
        }`;
        parent.appendChild(style);
        return true;
    }

    function scheduleStrip(generation) {
        if (adStripTimer || generation !== adGeneration) return;
        adStripTimer = setTimeout(() => {
            adStripTimer = null;
            if (generation !== adGeneration) return;
            stripAds();
        }, 250);
    }

    function startAdObserver(generation) {
        stripAds();
        const poll = () => {
            adPollTimer = setInterval(() => {
                if (generation !== adGeneration) return;
                stripAds();
            }, 2000);
        };
        if (typeof MutationObserver !== 'function') {
            console.warn(LOG, '不支持 MutationObserver，改用轮询');
            poll();
            return;
        }
        try {
            adObserver = new MutationObserver(mutations => {
                if (generation !== adGeneration) return;
                for (const mutation of mutations) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === 1) {
                            scheduleStrip(generation);
                            return;
                        }
                    }
                }
            });
            adObserver.observe(document.body, { childList: true, subtree: true });
            console.log(LOG, '广告移除已启用（Observer 模式）');
        } catch (e) {
            console.warn(LOG, 'Observer 启动失败，改用轮询', e);
            poll();
        }
    }

    function removePageAds() {
        if (!config.removePageAds) return;
        const generation = ++adGeneration;
        clearAdTimers();
        const boot = () => {
            if (generation !== adGeneration || !config.removePageAds) return;
            injectAdStyle();
            whenBody(() => {
                if (generation !== adGeneration || !config.removePageAds) return;
                if (!document.getElementById('adBlockStyle')) injectAdStyle();
                startAdObserver(generation);
            });
        };
        if (document.head || document.documentElement) boot();
        else whenBody(boot);
    }

    // ---------- 功能2：自动签到 ----------
    let signInObserver = null;
    let signInStopTimer = null;
    let signInDebounce = null;
    let signInGeneration = 0;

    function stopAutoSignIn() {
        signInGeneration++;
        if (signInObserver) {
            signInObserver.disconnect();
            signInObserver = null;
        }
        if (signInStopTimer) {
            clearTimeout(signInStopTimer);
            signInStopTimer = null;
        }
        if (signInDebounce) {
            clearTimeout(signInDebounce);
            signInDebounce = null;
        }
    }

    function findSignButton() {
        for (const sel of SIGN_IN_SELECTORS) {
            try {
                const btn = document.querySelector(sel);
                if (btn && !(btn.dataset && btn.dataset.autoClicked)) return btn;
            } catch (e) { /* 跳过无效选择器 */ }
        }
        return null;
    }

    function tryAutoSignIn() {
        const btn = findSignButton();
        if (!btn) return false;
        try { if (btn.dataset) btn.dataset.autoClicked = 'true'; } catch (e) { /* 标记失败时仍只点一次，下面会停掉观察器 */ }
        try { btn.click(); } catch (e) { console.warn(LOG, '自动签到点击失败', e); }
        console.log(LOG, '自动签到完成', btn);
        showToast('自动签到成功', 'success');
        stopAutoSignIn();
        return true;
    }

    function autoSignIn() {
        if (!config.autoSignIn) return;
        stopAutoSignIn();
        const generation = signInGeneration;
        whenBody(() => {
            if (generation !== signInGeneration || !config.autoSignIn) return;
            if (tryAutoSignIn()) return;
            const arm = () => {
                if (signInDebounce || generation !== signInGeneration) return;
                signInDebounce = setTimeout(() => {
                    signInDebounce = null;
                    if (generation !== signInGeneration) return;
                    tryAutoSignIn();
                }, 200);
            };
            if (typeof MutationObserver !== 'function') return;
            try {
                signInObserver = new MutationObserver(arm);
                signInObserver.observe(document.body, { childList: true, subtree: true });
            } catch (e) {
                console.warn(LOG, '签到观察器启动失败', e);
                return;
            }
            signInStopTimer = setTimeout(() => {
                if (generation !== signInGeneration) return;
                stopAutoSignIn();
            }, 10000);
        });
    }

    // ---------- API 拦截 ----------
    function markHook(fn) {
        try { Object.defineProperty(fn, HOOK, { value: true }); } catch (e) { /* 无法标记时仍可使用 */ }
        return fn;
    }

    function isHook(fn) {
        return !!(fn && fn[HOOK]);
    }

    function isObjectLike(value) {
        return !!value && (typeof value === 'object' || typeof value === 'function');
    }

    function defineHook(obj, key, fn, onSet) {
        markHook(fn);
        try {
            if (isHook(obj[key])) return true;
        } catch (e) { /* 读取原方法失败时继续覆盖 */ }
        const getter = markHook(function () { return fn; });
        try {
            Object.defineProperty(obj, key, {
                configurable: true,
                enumerable: true,
                get: getter,
                set(value) {
                    if (typeof onSet !== 'function') return;
                    try { onSet(value); } catch (e) { /* 忽略页面赋值 */ }
                }
            });
            return true;
        } catch (e) {
            try {
                obj[key] = fn;
                return isHook(obj[key]);
            } catch (err) {
                return false;
            }
        }
    }

    let delayHintShown = false;
    function shouldDelayAd() {
        if (config.delayMode) return true;
        const href = String(location && location.href || '');
        const path = String(location && location.pathname || '');
        return href.indexOf(FORCE_DELAY_SNIPPET) !== -1 || path.indexOf(FORCE_DELAY_SNIPPET) !== -1;
    }

    function playAd(callback) {
        if (typeof callback !== 'function') return;
        const multiplier = getAdMultiplier();
        const fireCallback = (code, message) => {
            try { callback({ code, message }); } catch (e) { /* 游戏回调出错不应中断奖励 */ }
        };

        if (shouldDelayAd()) {
            if (!delayHintShown) {
                delayHintShown = true;
                showToast('延时模式：请等待约 5 秒，期间不要操作', 'warning');
            }
            fireCallback(10000, '开始播放');
            setTimeout(() => fireCallback(10001, '播放结束'), AD_DELAY_MS);
            console.log(LOG, '延时模式：5 秒后发放奖励');
            return;
        }

        let count = 0;
        const maxPerTurn = 5;
        const process = () => {
            const batch = Math.min(maxPerTurn, multiplier - count);
            if (!(batch > 0)) return;
            for (let i = 0; i < batch; i++) {
                fireCallback(10000, '开始播放');
                fireCallback(10001, '播放结束');
            }
            count += batch;
            if (count < multiplier) setTimeout(process, 0);
            else console.log(LOG, '已阻止广告并发放奖励 x' + multiplier);
        };
        if (multiplier > 0) process();
    }

    function canPlayAd(callback) {
        safeCallback(callback, { canPlayAd: true, remain: 99999 });
        console.log(LOG, 'canPlayAd 返回 true');
        return true;
    }

    function showGuide(callback) {
        safeCallback(callback);
        console.log(LOG, '专属礼包领取成功');
        showToast('专属礼包领取成功', 'success');
    }

    function verifyState(callback) {
        safeCallback(callback, {
            eventType: '_verifyState',
            data: { needVerify: false, antiIndulge: 1 }
        });
        console.log(LOG, '已绕过防沉迷');
    }

    function hookSubmitRankScore(api) {
        let original = null;
        try {
            const current = api.submitRankScore;
            if (typeof current === 'function' && !isHook(current)) original = current;
        } catch (e) { /* 接口可能尚未挂上 */ }

        function submitRankScore(rankId, score, callback) {
            let userScore = null;
            try {
                userScore = prompt(
                    '您正在提交分数，请输入想要的分数 (谨慎使用)\n排行榜ID: ' + rankId,
                    score
                );
            } catch (e) {
                console.warn(LOG, '无法弹出分数输入框', e);
            }
            let finalScore = score;
            const typed = userScore == null ? '' : String(userScore).trim();
            if (typed !== '') {
                const num = Number(typed);
                if (!Number.isFinite(num)) {
                    showToast('无效分数，已取消提交', 'error');
                    return;
                }
                finalScore = num;
            }
            if (typeof original !== 'function') {
                showToast('排行榜接口尚未就绪', 'error');
                return;
            }
            try {
                return original.call(api, rankId, finalScore, result => {
                    try {
                        if (!result || typeof result !== 'object') {
                            alert('分数提交完毕，但接口没有返回结果');
                        } else {
                            alert(
                                '分数提交完毕\n状态码: ' + result.code +
                                '\n消息: ' + result.msg +
                                '\n历史最高分数: ' + (result.data ? result.data.score : undefined) +
                                '\n历史最高排名: ' + (result.data ? result.data.rank : undefined)
                            );
                        }
                    } catch (e) {
                        console.warn(LOG, '无法显示分数结果', e);
                    }
                    safeCallback(callback, result);
                });
            } catch (e) {
                console.warn(LOG, '分数提交失败', e);
                showToast('分数提交失败', 'error');
            }
        }

        return defineHook(api, 'submitRankScore', submitRankScore, value => {
            if (typeof value === 'function' && !isHook(value)) original = value;
        });
    }

    const loggedApis = new WeakSet();
    function patchApiObject(api, name) {
        if (!isObjectLike(api)) return true;
        const isH5api = name === 'h5api';
        let ok = true;
        ok = defineHook(api, 'playAd', playAd) && ok;
        ok = defineHook(api, 'canPlayAd', canPlayAd) && ok;
        ok = defineHook(api, 'showGuide', showGuide) && ok;
        if (!isH5api) {
            ok = defineHook(api, 'openVerify', verifyState) && ok;
            ok = defineHook(api, 'verifyState', verifyState) && ok;
        } else {
            ok = hookSubmitRankScore(api) && ok;
        }
        if (ok && !loggedApis.has(api)) {
            loggedApis.add(api);
            console.log(LOG, '已挂钩', name);
        }
        return ok;
    }

    const watcherInstalled = { h5api: false, H5API: false };
    let apiPollTimer = null;
    let apiPollStarted = false;

    function needsMorePolling() {
        for (const name of API_NAMES) {
            // 没装上赋值监听时，当前对象即使已挂钩，页面仍可换上新对象。
            // 这种情况下要把兜底轮询跑完，不能在第一次挂钩后停掉。
            if (!watcherInstalled[name]) return true;
            let api = null;
            try { api = pageWindow[name]; } catch (e) { return true; }
            if (!isObjectLike(api)) continue;
            try {
                if (!isHook(api.playAd)) return true;
            } catch (e) {
                return true;
            }
        }
        return false;
    }

    function startApiPoll() {
        const delays = [];
        for (let i = 0; i < 15; i++) delays.push(200);
        for (let i = 0; i < 12; i++) delays.push(1000);
        for (let i = 0; i < 24; i++) delays.push(5000);
        let index = 0;
        const tick = () => {
            apiPollTimer = null;
            API_NAMES.forEach(name => {
                try {
                    const api = pageWindow[name];
                    if (isObjectLike(api)) patchApiObject(api, name);
                } catch (e) { /* 下一轮再试 */ }
            });
            if (needsMorePolling()) schedule();
        };
        const schedule = () => {
            if (index >= delays.length) return;
            apiPollTimer = setTimeout(tick, delays[index++]);
        };
        schedule();
    }

    function ensurePoll() {
        if (apiPollStarted) return;
        apiPollStarted = true;
        startApiPoll();
    }

    function installWatcher(name) {
        let current;
        let busy = false;
        const accept = value => {
            current = value;
            if (!isObjectLike(value) || busy) return;
            busy = true;
            try {
                if (!patchApiObject(value, name)) ensurePoll();
            } catch (e) {
                console.warn(LOG, '挂钩失败', name, e);
                ensurePoll();
            } finally {
                busy = false;
            }
        };
        try {
            const desc = Object.getOwnPropertyDescriptor(pageWindow, name);
            if (isObjectLike(pageWindow[name])) accept(pageWindow[name]);
            if (desc && desc.configurable === false) {
                ensurePoll();
                return;
            }
            Object.defineProperty(pageWindow, name, {
                configurable: true,
                enumerable: true,
                get() { return current; },
                set(value) { accept(value); }
            });
            watcherInstalled[name] = true;
        } catch (e) {
            console.warn(LOG, '无法拦截', name, '改用轮询', e);
            try { accept(pageWindow[name]); } catch (err) { /* 留给轮询 */ }
            ensurePoll();
        }
    }

    function startApiWatchers() {
        API_NAMES.forEach(installWatcher);
    }

    // ---------- 更新检测 ----------
    function compareVersions(v1, v2) {
        const parse = v => String(v == null ? '' : v).split('.').map(part => {
            const n = parseInt(part, 10);
            return Number.isFinite(n) ? n : 0;
        });
        const parts1 = parse(v1);
        const parts2 = parse(v2);
        const len = Math.max(parts1.length, parts2.length);
        for (let i = 0; i < len; i++) {
            const a = parts1[i] || 0;
            const b = parts2[i] || 0;
            if (a > b) return 1;
            if (a < b) return -1;
        }
        return 0;
    }

    function handleUpdateBody(response, silent) {
        const status = response ? response.status : 0;
        if (status !== 200) {
            if (!silent) showToast('检查更新失败: HTTP ' + (status || '未知'), 'error');
            return;
        }
        const text = response.responseText || (typeof response.response === 'string' ? response.response : '');
        const versionMatch = String(text).match(/\/\/\s*@version\s+([\d.]+)/);
        if (!versionMatch) {
            if (!silent) showToast('无法解析远程版本号', 'error');
            return;
        }
        const remoteVersion = versionMatch[1];
        saveValue('lastUpdateCheck', Date.now(), false);
        console.log(LOG, '远程版本: ' + remoteVersion + ', 本地版本: ' + CURRENT_VERSION);
        if (compareVersions(remoteVersion, CURRENT_VERSION) > 0) {
            showToast('发现新版本 ' + remoteVersion + '，请前往更新！', 'warning');
            saveValue('lastKnownVersion', remoteVersion, false);
        } else if (!silent) {
            showToast('已是最新版本', 'success');
        }
    }

    function checkForUpdate(silent) {
        const url = config.updateCheckUrl;
        if (!url) {
            if (!silent) showToast('未设置更新检查地址', 'warning');
            return;
        }
        if (typeof GM_xmlhttpRequest !== 'function') {
            if (!silent) showToast('当前环境不支持检查更新', 'error');
            return;
        }
        let settled = false;
        const fail = message => {
            if (settled) return;
            settled = true;
            if (!silent) showToast(message, 'error');
        };
        try {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                timeout: 10000,
                onload(response) {
                    if (settled) return;
                    settled = true;
                    try {
                        handleUpdateBody(response, silent);
                    } catch (e) {
                        console.warn(LOG, '解析更新信息失败', e);
                        if (!silent) showToast('检查更新失败', 'error');
                    }
                },
                onerror() { fail('检查更新失败，网络错误'); },
                ontimeout() { fail('检查更新超时'); },
                onabort() { fail('检查更新已取消'); }
            });
        } catch (e) {
            console.warn(LOG, '检查更新失败', e);
            fail('检查更新失败');
        }
    }

    let updateCheckTimer = null;
    function startAutoUpdateCheck() {
        stopAutoUpdateCheck();
        if (!config.autoCheckUpdate) return;
        const now = Date.now();
        const lastCheck = Number(readValue('lastUpdateCheck', 0));
        if (!Number.isFinite(lastCheck) || now - lastCheck >= ONE_DAY) {
            checkForUpdate(true);
        }
        updateCheckTimer = setInterval(() => checkForUpdate(true), ONE_DAY);
    }

    function stopAutoUpdateCheck() {
        if (updateCheckTimer) {
            clearInterval(updateCheckTimer);
            updateCheckTimer = null;
        }
    }

    function updateMenu() {
        clearDynamicMenus();
        registerDynamicMenu('当前倍数: ' + getAdMultiplier(), () => {});
        registerDynamicMenu('UA: ' + uaLabel(config.ua), () => {});
        registerDynamicMenu('广告移除: ' + onOff(config.removePageAds), () => {});
        registerDynamicMenu('自动签到: ' + onOff(config.autoSignIn), () => {});
        registerDynamicMenu('自动更新: ' + onOff(config.autoCheckUpdate), () => {});
    }

    function showSettingsPanel() {
        const options = [
            '1. 延时模式 (当前: ' + stateWord(config.delayMode) + ')',
            '2. 广告移除 (当前: ' + stateWord(config.removePageAds) + ')',
            '3. 自动签到 (当前: ' + stateWord(config.autoSignIn) + ')',
            '4. 自动更新 (当前: ' + stateWord(config.autoCheckUpdate) + ')',
            '5. UA 设置 (当前: ' + uaLabel(config.ua) + ')',
            '6. 奖励倍数 (当前: ' + getAdMultiplier() + ')',
            '7. 立即检查更新',
            '8. 设置更新检查地址',
            '9. 刷新页面（使部分设置生效）',
            '0. 退出'
        ];
        const choice = prompt('⚙️ 功能设置面板\n输入序号进行操作：\n\n' + options.join('\n'));
        if (choice === null) return;

        switch (choice.trim()) {
            case '1':
                config.delayMode = !config.delayMode;
                saveValue('延时模式', config.delayMode ? '1' : '0');
                showToast('延时模式已' + (config.delayMode ? '开启' : '关闭') + '，立即刷新', 'success');
                location.reload();
                break;
            case '2':
                config.removePageAds = !config.removePageAds;
                saveValue('移除页面广告', config.removePageAds);
                if (config.removePageAds) {
                    removePageAds();
                    showToast('广告移除已开启', 'success');
                } else {
                    stopAdRemoval();
                    showToast('广告移除已关闭', 'warning');
                }
                updateMenu();
                break;
            case '3':
                config.autoSignIn = !config.autoSignIn;
                saveValue('自动签到', config.autoSignIn);
                if (config.autoSignIn) {
                    autoSignIn();
                    showToast('自动签到已开启', 'success');
                } else {
                    stopAutoSignIn();
                    showToast('自动签到已关闭', 'warning');
                }
                updateMenu();
                break;
            case '4':
                config.autoCheckUpdate = !config.autoCheckUpdate;
                saveValue('自动检查更新', config.autoCheckUpdate);
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
            case '8': {
                const input = prompt('请输入脚本 raw 文件地址', config.updateCheckUrl);
                if (input === null) break;
                const newUrl = input.trim();
                if (newUrl && !/^https?:\/\//i.test(newUrl)) {
                    showToast('地址需要以 http:// 或 https:// 开头', 'error');
                    break;
                }
                saveValue('更新检查地址', newUrl);
                config.updateCheckUrl = newUrl;
                showToast('更新地址已设置', 'success');
                break;
            }
            case '9':
                location.reload();
                break;
            case '0':
                break;
            default:
                showToast('无效的选项', 'error');
        }
    }

    let uaSaved = null;
    let uaHooked = false;

    function restoreUserAgent() {
        if (!uaSaved) {
            uaHooked = false;
            return;
        }
        try {
            if (uaSaved.desc) Object.defineProperty(uaSaved.target, 'userAgent', uaSaved.desc);
            else delete uaSaved.target.userAgent;
        } catch (e) {
            console.warn(LOG, '无法恢复 UA', e);
        }
        uaSaved = null;
        uaHooked = false;
    }

    function applyUserAgent() {
        const ua = config.ua;
        const spoof = !!(ua && ua !== 'default' && ua !== nativeUserAgent);
        if (!spoof) {
            if (uaHooked) restoreUserAgent();
            return true;
        }
        try {
            if (uaHooked && navigator.userAgent === ua) return true;
        } catch (e) { /* 继续尝试安装 */ }

        const desc = {
            configurable: true,
            enumerable: true,
            get() {
                const current = config.ua;
                if (!current || current === 'default') return nativeUserAgent;
                return current;
            }
        };
        const candidates = [];
        try { candidates.push(navigator); } catch (e) { /* 无 navigator */ }
        try {
            const proto = Object.getPrototypeOf(navigator);
            if (proto) candidates.push(proto);
        } catch (e) { /* 无原型 */ }
        try {
            if (pageWindow.navigator && pageWindow.navigator !== navigator) candidates.push(pageWindow.navigator);
        } catch (e) { /* 跨域窗口 */ }

        for (const target of candidates) {
            let before = null;
            try { before = Object.getOwnPropertyDescriptor(target, 'userAgent'); } catch (e) { before = null; }
            try {
                Object.defineProperty(target, 'userAgent', desc);
                if (navigator.userAgent === ua) {
                    uaHooked = true;
                    uaSaved = { target, desc: before };
                    return true;
                }
                if (before) Object.defineProperty(target, 'userAgent', before);
                else delete target.userAgent;
            } catch (e) { /* 试下一个目标 */ }
        }
        console.warn(LOG, '无法修改 UA');
        return false;
    }

    function setUserAgent(value, successText) {
        saveValue('UA', value);
        config.ua = value;
        const ok = applyUserAgent();
        showToast(ok ? successText : successText + '（已保存，当前页面未能改掉 UA）', ok ? 'success' : 'warning');
        updateMenu();
    }

    function showUASettings() {
        const choice = prompt(
            '选择 UA 类型：\n1. 4399在线玩\n2. 4399游戏盒广场\n3. 浏览器默认\n当前: ' + (config.ua === 'default' ? '默认' : config.ua),
            '1'
        );
        if (choice === null) return;
        switch (choice.trim()) {
            case '1':
                setUserAgent('4399wan', 'UA 已设为 4399在线玩');
                break;
            case '2':
                setUserAgent('4399GameCenter minigame', 'UA 已设为 4399游戏盒广场');
                break;
            case '3':
                setUserAgent('default', 'UA 已恢复默认');
                break;
            default:
                showToast('无效选项', 'error');
                updateMenu();
        }
    }

    function showMultiplierSettings() {
        const choice = prompt(
            '当前广告奖励倍数: ' + getAdMultiplier() + '\n\n输入新倍数（过大可能导致卡顿，建议 1~100）',
            getAdMultiplier()
        );
        if (choice === null) return;
        const num = Number(choice);
        if (!Number.isFinite(num) || num <= 0) {
            showToast('无效数字', 'error');
            return;
        }
        saveValue('AD', String(num));
        config.adMultiplier = num;
        updateMenu();
        showToast('奖励倍数已设为 ' + num + '，下次广告生效', 'success');
    }

    function lockGlobal(key, value) {
        try {
            Object.defineProperty(pageWindow, key, { value: value, writable: false });
            return;
        } catch (e) { /* 页面可能已锁定该属性 */ }
        try { pageWindow[key] = value; } catch (err) { /* 忽略 */ }
    }

    function clearDebugTrap() {
        try {
            const id = pageWindow._windon_handler;
            if (id == null) return;
            try { pageWindow.clearInterval(id); } catch (e) { /* 页面 clearInterval 不可用 */ }
            try { clearInterval(id); } catch (e) { /* 沙箱定时器对不上 */ }
            try { pageWindow._windon_handler = null; } catch (e) { /* 属性可能只读 */ }
        } catch (e) { /* 跨域或未定义 */ }
    }

    function disarmDebugTrap() {
        const noop = () => {};
        lockGlobal('check', noop);
        lockGlobal('consoleOpenCallback', noop);
        clearDebugTrap();
        let left = 20;
        const timer = setInterval(() => {
            clearDebugTrap();
            if (--left <= 0) clearInterval(timer);
        }, 500);
    }

    function initMenus() {
        if (initMenus.done) return;
        initMenus.done = true;
        try {
            GM_registerMenuCommand('⚙️ 功能设置面板', showSettingsPanel);
            GM_registerMenuCommand('🔄 解决访问错误', () => location.reload());
            GM_registerMenuCommand('🔍 立即检查更新', () => checkForUpdate(false));
            updateMenu();
            startAutoUpdateCheck();
        } catch (e) {
            console.warn(LOG, '菜单初始化失败', e);
        }
    }

    function main() {
        // 必须在页面脚本之前同步装上，否则 h5api 替换后 5 秒内的 playAd 会漏掉
        startApiWatchers();

        const is4399 = !!(location && location.host && location.host.indexOf('4399') !== -1);
        if (!is4399) return;

        try { disarmDebugTrap(); } catch (e) { console.warn(LOG, '调试拦截失败', e); }
        try { applyUserAgent(); } catch (e) { console.warn(LOG, 'UA 初始化失败', e); }
        try { removePageAds(); } catch (e) { console.warn(LOG, '广告移除初始化失败', e); }
        try { autoSignIn(); } catch (e) { console.warn(LOG, '签到初始化失败', e); }

        if (self === top) {
            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initMenus, { once: true });
            else initMenus();
        }
    }

    try {
        main();
    } catch (e) {
        console.error(LOG, '启动失败', e);
    }
    console.log(LOG, '脚本就绪，耗时 ' + (Date.now() - startTime) + 'ms');
})();
