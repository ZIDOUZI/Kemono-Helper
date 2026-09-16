// ==UserScript==
// @name         Kemono助手
// @version      2.4.0
// @description  提供更好的 Kemono / Pawchive 使用体验
// @author       ZIDOUZI
// @match        https://*.kemono.party/*
// @match        https://*.kemono.su/*
// @match        https://*.kemono.cr/*
// @match        https://*.nekohouse.su/*
// @match        https://pawchive.pw/*
// @match        https://pawchive.st/*
// @icon         https://kemono.su/static/favicon.ico
// @require      https://cdn.jsdelivr.net/npm/sweetalert2@11
// @require      https://kit.fontawesome.com/101092ae56.js
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @license      GPL-3.0
// @namespace https://greasyfork.org/users/448292
// ==/UserScript==

let kemonoHelperMenuId;

// 键盘导航只需绑定一次，但翻页按钮每次都要重新获取（页面会局部刷新）
let keyboardNavigationBound = false;

// 页面变化监听只需初始化一次
let pageWatcherInitialized = false;

// 等待插入位置出现的轮询只允许有一个
let buttonPollRunning = false;

/**
 * 获取站点对应的文件服务器域名
 * pawchive 的站点与文件服务器是分开的，文件存放在 file.pawchive.pw
 * @param {string} domain
 */
function getFileDomain(domain) {
    if (/(^|\.)pawchive\.(pw|st)$/i.test(domain)) return 'file.pawchive.pw';
    return domain;
}

/**
 * 页面是否由前端渲染（此时首屏可能还没有正文和按钮的插入位置）
 */
function isClientRenderedPage() {
    return !!document.querySelector('#root:empty, #app:empty');
}

(async function () {
    'use strict';
    await main().catch(function (error) {
        console.log(error)
        alert(`Kemono助手发生错误: ${error.status} ${error.statusText}`)}
    );
})();

async function main() {

    const isFirstRun = !pageWatcherInitialized;

    const language = navigator.language || navigator.userLanguage;

    const domain = window.location.href.match(/https:\/\/([^/]+)/)[1];

    const fileDomain = getFileDomain(domain);

    if (kemonoHelperMenuId !== undefined) GM_unregisterMenuCommand(kemonoHelperMenuId);
    kemonoHelperMenuId = GM_registerMenuCommand('Kemono助手设置', showDialog);

    const data = await (async () => {
        let _vimMode = GM_getValue('vimMode', false)
        let _rpc = GM_getValue('rpc', 'http://localhost:6800/jsonrpc')
        let _token = GM_getValue('token', '')
        let _dir = GM_getValue('dir', '')
        let _first = GM_getValue('first', true)
        if (_dir === '' && !_first) {
            try {
                _dir = await fetchDownloadDir(_rpc, _token) + "/kemono/{service}-{artist_id}/{post}-{post_id}/{index}_{auto_named}.{extension}";
            } catch (e) {
                // ignore
            }
            GM_setValue('dir', _dir);
        }
        return {
            get vimMode() {
                return _vimMode;
            }, set vimMode(value) {
                _vimMode = value;
                GM_setValue('vimMode', value);
            }, get rpc() {
                return _rpc;
            }, set rpc(value) {
                _rpc = value;
                GM_setValue('rpc', value);
            }, get token() {
                return _token;
            }, set token(value) {
                _token = value;
                GM_setValue('token', value);
            }, get dir() {
                return _dir;
            }, set dir(value) {
                // if (/[:*?"<>|]/g.test(value)) {
                //     alert('下载目录中不能包含以下字符： : * ? " < > |\n您可以选择换为全角字符')
                //     return;
                // }
                _dir = value;
                GM_setValue('dir', value);
            }, format(date) {
                return date.toISOString().split('.')[0].replace('T', ' ').replaceAll(':', '-')
            }, formatDir(post, index, name, extension, padStart = 3) {
                const indexString = index.toString().padStart(padStart, '0');
                const shouldReplace = /^([0-9a-fA-F]{4}-?){8}$/.test(name)
                    || (/^[a-zA-Z0-9]+$/.test(name) && post.service === "fanbox") || name.length + extension.length > 255;
                if (name.length + extension.length > 255) name = name.slice(0, 255 - extension.length);
                return _dir
                    .replaceAll(/\{js:(.*?)#}/g, function (_, code) {
                        return eval(code);
                    })
                    .replaceAll(/[\/\\]/g, '≸∱').replaceAll(':', '∱≸')
                    .replaceAll('{service}', post.service)
                    .replaceAll('{artist_id}', post.user)
                    .replaceAll('{date}', this.format(new Date(Date.parse(post.published))))
                    .replaceAll('{post}', post.title)
                    .replaceAll('{post_id}', post.id)
                    .replaceAll('{time}', this.format(new Date()))
                    .replaceAll('{index0}', indexString)
                    .replaceAll('{index}', index === 0 ? '' : indexString)
                    .replaceAll('{auto_named}', shouldReplace ? indexString : name)
                    .replaceAll('{name}', name)
                    .replaceAll('{extension}', extension)
                    // avoid illegal characters in windows folder and file name
                    .replaceAll(':', '：')
                    .replaceAll('*', '＊')
                    .replaceAll('?', '？')
                    .replaceAll('"', '“')
                    .replaceAll('<', '《')
                    .replaceAll('>', '》')
                    .replaceAll('|', '｜')
                    .replaceAll('/', '／')
                    .replaceAll('\\', '＼')
                    .replaceAll('≸∱', '\\').replaceAll('∱≸', ':')
                    .replaceAll(/[\s.]+\\/g, '\\'); // remove space and dot
            }
        }
    })()

    // pawchive 的正文容器是 .post__body，kemono 是 .post__content
    const postContent = document.querySelector('.post__content') || document.querySelector('.post__body')
    if (postContent && !postContent.hasAttribute('data-kemono-helper-rewritten')) {
        postContent.setAttribute('data-kemono-helper-rewritten', '1');
        // 保护 iframe 内容不被替换（感谢 nd002723 反馈）
        const iframePlaceholders = [];
        let html = postContent.innerHTML.replace(/<iframe[\s\S]*?<\/iframe>/gi, function (match) {
            const idx = iframePlaceholders.length;
            iframePlaceholders.push(match);
            return `<!--IFRAME_PLACEHOLDER_${idx}-->`;
        });

        replaceAsync(html, /(?<!a href="|<a [^>]+">)(https?:\/\/[^\s<]+)/g, async function (match) {
            let [service, id, post] = await getKemonoUrl(match);
            if (service === null) return `<a href="${match}" target="_blank">${match}</a>`;
            id = id || window.location.href.match(/\/user\/(\d+)/)[1];
            const domain = window.location.href.match(/https:\/\/([^/]+)/)[1];
            const url = `${service}/user/${id}${post ? `/post/${post}` : ""}`;
            return `<a href="https://${domain}/${url}" target="_self">[已替换]${match}</a>`;
        }).then(function (result) {
            // 恢复 iframe 内容
            result = result.replace(/<!--IFRAME_PLACEHOLDER_(\d+)-->/g, function (_, idx) {
                return iframePlaceholders[parseInt(idx)];
            });
            postContent.innerHTML = result
                .replace(/<a href="(https:\/\/[^\s<]+)">\1<\/a>\n?(#[^\s<]+)/g, `<a href="$1$2">$1$2</a>`)
                .replace(/<a href="(https:\/\/[^\s<]+)">(.*?)<\/a>\n?(#[^\s<]+)/g, `<a href="$1$3">$2</a>`)
        }).catch(function (error) {
            console.log(error)
        })
    }

    // 键盘导航：翻页按钮每次从文档里重新获取，避免页面局部刷新后失效
    if (!keyboardNavigationBound && (document.querySelector(".post__nav-link.prev") || document.querySelector(".post__nav-link.next"))) {
        keyboardNavigationBound = true;
        document.addEventListener("keydown", function (e) {
            if (e.key === "Right" || e.key === "ArrowRight" || data.vimMode && (e.key === "h" || e.key === "H")) {
                document.querySelector(".post__nav-link.prev")?.click();
            }
            if (e.key === "Left" || e.key === "ArrowLeft" || data.vimMode && (e.key === "l" || e.key === "L")) {
                document.querySelector(".post__nav-link.next")?.click();
            }
        });
    }

    if (language === 'zh-CN') {
        const dms = document.querySelector('.user-header__dms');

        if (dms) dms.innerHTML = '私信'

        const flagText = document.querySelector('.post__flag')
            ?.querySelector('span:last-child');

        if (flagText) {
            flagText.textContent = '标记';
            flagText.title = '标记为需要重新导入的内容'
        }
    }

    async function downloadPostContent(post) {
        // pawchive 上尚未归档(preview_state=pending)的帖子在文件服务器上是 403，直接跳过
        // kemono 的接口没有该字段，行为不变
        if (post.preview_state !== undefined && post.preview_state !== 'scraped') {
            console.log(`[Kemono助手] 跳过未归档的帖子 ${post.id} (preview_state=${post.preview_state})`);
            return;
        }
        // 收集封面和附件并去重，跳过未归档（没有文件）的帖子（感谢 jacklee0708 反馈）
        const attachments = [];
        for (const file of [post.file, ...(post.attachments || [])]) {
            if (!file || !file.path) continue;
            if (attachments.some(exist => exist.path === file.path)) continue;
            attachments.push(file);
        }
        if (attachments.length === 0) return;
        const padStart = Math.max(3, attachments.length.toString().length);
        for (const [i, { name: fileName, path }] of attachments.entries()) {
            // 处理旧资源没有 name 的情况（感谢 mitsukaze 反馈）
            const name = fileName || Math.floor(Math.random() * 1000000) + "_random";
            // 从原始文件名获取扩展名，比从 path 获取更准确（感谢 Rui DSaaCC 反馈）
            const extension = name.includes('.') ? name.split('.').pop() : path.split('.').pop();
            const filename = name.replace(/\.\w+$/, '');
            await downloadContent(data.rpc, data.token, data.formatDir(post, i, filename, extension, padStart), `https://${fileDomain}/data${path}`);
        }
    }

    /**
     * 创建页头上的按钮
     * @param {string} action 按钮名，同时决定样式类名
     * @param {string} iconClass fontawesome 图标类名
     * @param {string} text 按钮文字
     */
    function createHeaderButton(action, iconClass, text = '') {
        const button = document.createElement('button');
        button.classList.add('kemono-helper-button', `${mode}-header__${action}`);
        button.style.backgroundColor = 'transparent';
        button.style.borderColor = 'transparent';
        button.style.color = 'white';
        button.innerHTML = `
            <i class="fa-solid ${iconClass} ${mode}-header_${action}-icon"></i>
            ${text ? `<span class="${mode}-header__${action}-text">${text}</span>` : ''}
        `;
        return button;
    }

    /**
     * 收藏页的操作栏
     * kemono 使用 .dropdowns，pawchive 等新前端没有该元素，需要自行插入
     */
    function getFavoritesHeader() {
        const exist = document.querySelector('.dropdowns') || document.querySelector('.favorites-header__actions');
        if (exist) return exist;
        const content = document.querySelector('.site-section.site-section--favorites');
        if (!content) return null;
        const actions = document.createElement('div');
        actions.classList.add('favorites-header__actions');
        actions.style.display = 'flex';
        actions.style.justifyContent = 'center';
        const filterForm = content.querySelector('form#filter-favorites, form.dropdowns');
        content.insertBefore(actions, filterForm ? filterForm.nextSibling : content.firstChild);
        return actions;
    }

    /**
     * 收藏页当前选中的类型
     * kemono 的第一个 option 是 post，第二个是 artist
     * pawchive 使用 type 查询参数或 select[name="type"]
     */
    function getFavoritesType() {
        const select = document.querySelector('.dropdowns>select:nth-child(2), select[name="type"]');
        const firstOption = select ? select.querySelector('option:nth-child(1)') : null;
        if (firstOption) return firstOption.selected ? 'post' : 'artist';
        return new URLSearchParams(window.location.search).get('type')
            || select?.value
            || window.location.pathname.match(/\/favorites\/(\w+)/)?.[1]
            || 'artist';
    }

    let mode;
    let header;
    let listener;
    if (window.location.href.match(/\/user\/\w+\/post\/\w+/)) {
        mode = 'post';
        header = document.querySelector('.post__actions');
        listener = async () => {
            const apiUrl = `${window.location.origin}/api/v1${window.location.pathname}`;
            const result = await safeFetch(apiUrl);
            await downloadPostContent(result.post || result);
        }
    } else if (window.location.href.match(/\/user\/\w+/)) {
        mode = 'user';
        header = document.querySelector('.user-header__actions');
        listener = async () => {
            for (let post of await getPosts(window.location.pathname)) await downloadPostContent(post)
        }
    } else if (window.location.href.match(/\/favorites/)) {
        mode = 'favor';
        header = getFavoritesHeader();
        listener = async () => {
            // 修复收藏页下载逻辑：根据当前选中的类型决定下载内容（感谢 Tempale Nico, PicLover 反馈）
            const isPostSelected = getFavoritesType() === 'post';
            const posts = isPostSelected
                ? await safeFetch(`${window.location.origin}/api/v1/account/favorites?type=post`)
                : await (async () => {
                    const artists = await safeFetch(`${window.location.origin}/api/v1/account/favorites?type=artist`)
                    const result = []
                    for (const artist of artists) {
                        result.push(...await getPosts(`${artist.service}/user/${artist.id}`))
                    }
                    return result;
                })()
            for (let post of posts) await downloadPostContent(post)
        }
    }

    if (header) {
        // 页面局部刷新后先移除旧按钮，避免重复插入
        header.querySelectorAll('.kemono-helper-button').forEach(button => button.remove());

        const settings = createHeaderButton('settings', 'fa-gear');
        settings.addEventListener('click', showDialog);

        const download = createHeaderButton('download', 'fa-download', '下载');

        download.addEventListener('click', async function () {
            download.innerHTML = `
                <i class="fa-solid fa-spinner fa-spin-pulse ${mode}-header_download-icon"></i>
                <span class="${mode}-header__download-text">下载中...</span>
            `;
            try {
                await listener();
                download.innerHTML = `
                    <i class="fa-solid fa-check ${mode}-header_download-icon"></i>
                    <span class="${mode}-header__download-text">下载/推送完成</span>
                `;
            } catch (error) {
                console.log(error);
                download.innerHTML = `
                    <i class="fa-solid fa-triangle-exclamation ${mode}-header_download-icon"></i>
                    <span class="${mode}-header__download-text">下载失败</span>
                `;
                alert(`Kemono助手发生错误: ${error.status ?? ''} ${error.statusText ?? error.message ?? error}`);
            }
        }, { once: true });

        header.appendChild(settings);
        header.appendChild(download);
    } else if (mode !== undefined && isFirstRun && !isClientRenderedPage()) {
        alert('未找到插入位置, 请将本页源代码发送给开发者以解决此问题');
    }

    function showDialog() {
        swal.fire({
            title: '设置', html: `
                <div>
                    <label for="rpc">Aria2 RPC地址</label>
                    <input type="text" id="rpc" value="${data.rpc}">
                </div>
                <div>
                    <label for="token">Aria2 Token</label>
                    <input type="text" id="token" value="${data.token}">
                </div>
                <div>
                    <label for="dir">下载目录</label>
                    <i class="fa-solid fa-info-circle" title="支持的变量:
                     {service}: 服务器, 如fanbox
                     {artist_id}: 作者ID
                     {date}: 发布时间
                     {post}: 作品标题
                     {post_id}: 作品ID
                     {time}: 下载时间
                     {index0}: 从0开始的序号。cover将编号为0
                     {index}: 从1开始的序号。cover的编号为空白
                     {auto_named}: 当文件名为uuid时将使用空命名。否则使用文件名
                     {name}: 文件名 
                     {extension}: 文件扩展名。必须带有此项
                     {js:...#}: js代码. 可用参数请参考源代码85行处formatDir方法"></i>
                    <textarea cols="20" id="dir">${data.dir}</textarea>
                </div>
                <div>
                    <label for="vimMode">Vim模式</label>
                    <input type="checkbox" id="vimMode" checked="${data.vimMode}">
                </div>
            `, showCancelButton: true, confirmButtonText: '保存', cancelButtonText: '取消'
        }).then((result) => {
            if (result.isConfirmed) {
                data.rpc = document.getElementById('rpc').value;
                data.token = document.getElementById('token').value;
                data.dir = document.getElementById('dir').value;
                data.vimMode = document.getElementById('vimMode').checked;
                location.reload();
            }
        });
    }

    // 页面通过 htmx 局部刷新或前端路由切换后重新初始化（pawchive 与 kemono 新前端）
    let reinitTimer;
    const scheduleReinit = function () {
        clearTimeout(reinitTimer);
        reinitTimer = setTimeout(function () {
            main().catch(function (error) { console.log(error) });
        }, 100);
    };
    if (isFirstRun) {
        pageWatcherInitialized = true;
        document.addEventListener('htmx:afterSettle', scheduleReinit);
        window.addEventListener('popstate', scheduleReinit);
    }

    // 前端渲染的页面首屏可能还没有按钮的插入位置，轮询等待（最多约 20 秒）
    if (mode !== undefined && !document.querySelector('.kemono-helper-button') && !buttonPollRunning) {
        buttonPollRunning = true;
        let attempts = 0;
        const poll = setInterval(function () {
            if (document.querySelector('.kemono-helper-button') || ++attempts > 40) {
                clearInterval(poll);
                buttonPollRunning = false;
                if (!document.querySelector('.kemono-helper-button')) {
                    alert('未找到插入位置, 请将本页源代码发送给开发者以解决此问题');
                }
                return;
            }
            scheduleReinit();
        }, 500);
    }

}

async function replaceAsync(str, regex, asyncFn) {
    const promises = [];
    str.replace(regex, (match, ...args) => {
        const promise = asyncFn(match, ...args);
        promises.push(promise);
    });
    const data = await Promise.all(promises);
    return str.replace(regex, () => data.shift());
}

async function getKemonoUrl(url) {

    function getFanbox(creatorId) {
        // 同步执行promise
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET", url: `https://api.fanbox.cc/creator.get?creatorId=${creatorId}`, headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "Origin": "https://www.fanbox.cc",
                    "Referer": "https://www.fanbox.cc/"
                }, onload: function (response) {
                    if (response.status === 200) {
                        resolve(JSON.parse(response.responseText))
                    } else {
                        reject({ status: response.status, statusText: response.statusText })
                    }
                }, onerror: function (response) {
                    reject({ status: response.status, statusText: response.statusText })
                }
            })
        })
    }

    const pixiv_user = /https:\/\/www\.pixiv\.net\/users\/(\d+)/i;
    const fantia_user = /https:\/\/fantia\.jp\/fanclubs\/(\d+)(\/posts(\S+))?/i;
    const fanbox_user1 = /https:\/\/www\.fanbox\.cc\/@([^/]+)(?:\/posts\/(\d+))?/i;
    const fanbox_user2 = /https:\/\/(.+)\.fanbox\.cc(?:\/posts\/(\d+))?/i;
    const dlsite_user = /https:\/\/www.dlsite.com\/.+?\/profile\/=\/maker_id\/(RG\d+).html/i;
    const patreon_user1 = /https:\/\/www.patreon.com\/user\?u=(\d+)/i;
    const patreon_user2 = /https:\/\/www.patreon.com\/(\w+)/i;
    const patreon_post1 = /https:\/\/www.patreon.com\/posts\/(\d+)/i;
    const patreon_post2 = /https:\/\/www.patreon.com\/posts\/video-download-(\d+)/i;

    let service;
    let id;
    let post = null;

    if (pixiv_user.test(url)) {
        //pixiv artist
        service = "fanbox"
        id = url.match(pixiv_user)[1]
    } else if (fantia_user.test(url)) {
        //fantia
        service = "fantia"
        id = url.match(fantia_user)[1]
    } else if (dlsite_user.test(url)) {
        service = "dlsite"
        id = url.match(dlsite_user)[1]
    } else if (fanbox_user1.test(url) || fanbox_user2.test(url)) {
        //fanbox
        service = "fanbox"
        let matches = fanbox_user1.test(url) ? url.match(fanbox_user1) : url.match(fanbox_user2);
        id = (await getFanbox(matches[1])).body.user.userId.toString()
        post = matches[2]
    } else if (patreon_user1.test(url)) {
        // patreon
        service = "patreon"
        id = url.match(patreon_user1)[1]
    } else if (patreon_post1.test(url)) {
        // patreon post
        service = "patreon"
        post = url.match(patreon_post1)[1]
    } else if (patreon_post2.test(url)) {
        // patreon post
        service = "patreon"
        post = url.match(patreon_post2)[1]
    } else {
        return null;
    }

    return [service, id, post]
}

async function safeFetch(url) {
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
        attempts++;
        try {
            const _fetch = typeof unsafeWindow !== 'undefined' ? unsafeWindow.fetch : fetch;
            const response = await _fetch(url, {
                method: "GET",
                credentials: "include",
                headers: {
                    "Accept": "text/css",
                    "User-Agent": navigator.userAgent,
                    "Referer": window.location.href,
                    "Origin": window.location.origin,
                    "Accept-Language": navigator.language || "zh-CN,zh;q=0.9",
                    "Sec-Fetch-Site": "same-origin",
                    "Sec-Fetch-Mode": "cors",
                    "Sec-Fetch-Dest": "empty",
                    "Cache-Control": "no-cache",
                    "Pragma": "no-cache"
                },
                cache: "no-store"
            });

            if (response.ok) {
                const text = await response.text();
                return JSON.parse(text);
            } else if (response.status === 429) {
                // rate limited, wait longer
                console.warn(`[Kemono助手] 被限速，等待60秒后重试...`);
                await new Promise(r => setTimeout(r, 60000));
                attempts--; // don't count rate-limit against retry count
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (e) {
            console.warn(`[Kemono助手] 第 ${attempts} 次请求失败 (${url}) → ${e.message}`);
            if (attempts < maxAttempts) {
                const delay = 1500 + Math.random() * 1000;
                await new Promise(r => setTimeout(r, delay));
            } else {
                throw e;
            }
        }
    }
}

async function getPosts(path, order = 0) {
    let posts = [];
    const base = window.location.origin;
    const pageSize = 25;

    let cleanPath = path.replace(/^\/+|\/+$/g, '');

    while (true) {
        const apiUrl = `${base}/api/v1/${cleanPath}/posts?o=${order}`;
        console.log(`[Kemono助手] 正在请求 → ${apiUrl}`);

        let data;
        try {
            data = await safeFetch(apiUrl);
        } catch (e) {
            console.error(`[Kemono助手] ${apiUrl} 最终失败 → ${e.message}`);
            break;
        }

        if (!data || !Array.isArray(data) || data.length === 0) {
            console.log(`[Kemono助手] 获取完成！共 ${posts.length} 个帖子`);
            break;
        }

        posts = posts.concat(data);
        order += data.length;

        // 请求间延迟，避免触发限速
        await new Promise(r => setTimeout(r, 1600 + Math.random() * 900));
        if (data.length < pageSize) break;
    }

    return posts;
}

/**
 * send request to aria2 for download
 * @param {string} rpc
 * @param {string} token
 * @param {string} file
 * @param {string} url
 */
async function downloadContent(rpc, token, file, ...url) {
    const dir = file.replace(/(.+?[\/\\])[^\/\\]+$/, "$1");
    const out = file.slice(dir.length);
    const params = token === undefined
        ? out === ""
            ? [url, { "dir": dir }]
            : [url, { "dir": dir, "out": out }]
        : out === ""
            ? [`token:${token}`, url, { "dir": dir }]
            : [`token:${token}`, url, { "dir": dir, "out": out }]
    return new Promise((resolve) => {
        GM_xmlhttpRequest({
            method: "POST", url: rpc, data: JSON.stringify({
                jsonrpc: "2.0", id: `kemono-${crypto.randomUUID()}`, method: "aria2.addUri", params: params
            }), onload: function (response) {
                if (response.status === 200) {
                    resolve(JSON.parse(response.responseText))
                } else {
                    console.log(`添加下载任务失败: ${response.status} ${response.statusText}`)
                }
            }, onerror: function (response) {
                console.log(`添加下载任务失败: ${response.status} ${response.statusText}`)
            }
        })
    })
}

async function fetchDownloadDir(rpc, token) {
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: "POST", url: rpc, headers: {
                "Content-Type": "application/json", "Accept": "application/json",
            }, data: JSON.stringify({
                jsonrpc: "2.0", id: "Kemono", method: "aria2.getGlobalOption", params: token ? [`token:${token}`] : []
            }), onload: function (response) {
                if (response.status === 200) {
                    resolve(JSON.parse(response.responseText))
                } else {
                    reject({ status: response.status, statusText: response.statusText })
                }
            }, onerror: function (response) {
                reject({ status: response.status, statusText: response.statusText })
            }
        })
    }).then(function (result) {
        return result.result.dir;
    })
}
