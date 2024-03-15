// ==UserScript==
// @name         Kemono助手
// @version      2.0.18
// @description  提供更好的Kemono使用体验
// @author       ZIDOUZI
// @match        https://*.kemono.party/*
// @match        https://*.kemono.su/*
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

(async function () {
    'use strict';
    await main().catch(function (error) {
        console.log(error)
        alert(`Kemono助手发生错误: ${error.status} ${error.statusText}`)}
    );
})();

async function main() {

    const language = navigator.language || navigator.userLanguage;

    const domain = window.location.href.match(/https:\/\/([^/]+)/)[1];

    const menuId = GM_registerMenuCommand('Kemono助手设置', showDialog);

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
                    .replaceAll(/\{js:(.*)#}/g, function (_, code) {
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
                    .replaceAll('≸∱', '\\').replace('∱≸', ':')
                    .replaceAll(/[\s.]+\\/g, '\\'); // remove space and dot
            }
        }
    })()

    const postContent = document.querySelector('.post__content')
    if (postContent) {
        replaceAsync(postContent.innerHTML, /(?<!a href="|<a [^>]+">)(https?:\/\/[^\s<]+)/g, async function (match) {
            let [service, id, post] = await getKemonoUrl(match);
            if (service === null) return `<a href="${match}" target="_blank">${match}</a>`;
            id = id || window.location.href.match(/\/user\/(\d+)/)[1];
            const domain = window.location.href.match(/https:\/\/([^/]+)/)[1];
            const url = `${service}/user/${id}${post ? `/post/${post}` : ""}`;
            return `<a href="https://${domain}/${url}" target="_self">[已替换]${match}</a>`;
        }).then(function (result) {
            postContent.innerHTML = result
                .replace(/<a href="(https:\/\/[^\s<]+)">\1<\/a>\n?(#[^\s<]+)/g, `<a href="$1$2">$1$2</a>`)
                .replace(/<a href="(https:\/\/[^\s<]+)">(.*?)<\/a>\n?(#[^\s<]+)/g, `<a href="$1$3">$2</a>`)
        })
    }

    const prev = document.querySelector(".post__nav-link.prev");
    if (prev) {
        document.addEventListener("keydown", function (e) {
            if (e.key === "Right" || e.key === "ArrowRight" || data.vimMode && (e.key === "h" || e.key === "H")) {
                prev.click();
            }
        });
    }

    const next = document.querySelector(".post__nav-link.next");
    if (next) {
        document.addEventListener("keydown", function (e) {
            if (e.key === "Left" || e.key === "ArrowLeft" || data.vimMode && (e.key === "l" || e.key === "L")) {
                next.click();
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
        if (Object.keys(post.file).length !== 0) post.attachments.unshift(post.file)
        const padStart = Math.max(3, post.attachments.length.toString().length);
        for (let [i, { name, path }] of post.attachments.entries()) {
            const extension = path.split('.').pop();
            const filename = name.replace(/\.\w+$/, '');
            await downloadContent(data.rpc, data.token, data.formatDir(post, i, filename, extension, padStart), `https://${domain}/data${path}`);
        }
    }

    let mode;
    let header;
    let listener;
    if (window.location.href.match(/\/user\/\w+\/post\/\w+/)) {
        mode = 'post';
        header = document.querySelector('.post__actions');
        listener = async () => await downloadPostContent(await (await fetch(`/api/v1${window.location.pathname}`)).json())
    } else if (window.location.href.match(/\/user\/\w+/)) {
        mode = 'user';
        header = document.querySelector('.user-header__actions');
        listener = async () => {
            for (let post of await getPosts(window.location.pathname)) await downloadPostContent(post)
        }
    } else if (window.location.href.match(/\/favorites/)) {
        mode = 'favor';
        header = document.querySelector('.dropdowns');
        const type = document.querySelector('.dropdowns>select:nth-child(2)>option:nth-child(1)');
        listener = async () => {
            const posts = type.selected !== true
                ? await (await fetch(`/api/v1/account/favorites?type=post`)).json()
                : await (async () => {
                    const response = await fetch(`/api/v1/account/favorites?type=artist`)
                    const result = []
                    for (const artist of await response.json()) {
                        result.push(...await getPosts(`${artist.service}/user/${artist.id}`))
                    }
                    return result;
                })()
            for (let post of posts) await downloadPostContent(post)
        }
    }

    if (header) {
        const settings = document.createElement('button');
        settings.classList.add(`${mode}-header__settings`);
        settings.style.backgroundColor = 'transparent';
        settings.style.borderColor = 'transparent';
        settings.style.color = 'white';
        settings.innerHTML = `
            <i class="fa-solid fa-gear ${mode}-header_settings-icon"/>
        `;
        settings.addEventListener('click', showDialog);

        const download = document.createElement('button');
        download.classList.add(`${mode}-header__download`);
        download.style.backgroundColor = 'transparent';
        download.style.borderColor = 'transparent';
        download.style.color = 'white';
        download.innerHTML = `
            <i class="fa-solid fa-download ${mode}-header_download-icon"/>
            <span class="${mode}-header__download-text">下载</span>
        `;

        download.addEventListener('click', async function () {
            download.innerHTML = `
                <i class="fa-solid fa-spinner fa-spin-pulse ${mode}-header_download-icon"></i>
                <span class="${mode}-header__download-text">下载中...</span>
            `;
            await listener();
            download.innerHTML = `
                <i class="fa-solid fa-check ${mode}-header_download-icon"/>
                <span class="${mode}-header__download-text">下载/推送完成</span>
            `;
        }, { once: true });

        header.appendChild(settings);
        header.appendChild(download);
    } else if (mode !== undefined) {
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

async function getPosts(path, order = 0) {
    let posts = [];
    while (true) {
        const response = await fetch(`/api/v1/${path}?o=${order}`)
        // TODO: 429 too many requests, 80 request per minute
        if (response.status === 429) {
            await new Promise(resolve => setTimeout(resolve, 60000))
            continue;
        }
        if (response.status !== 200) throw { status: response.status, statusText: response.statusText }
        const items = await response.json();
        posts.push(...items);
        if (items.length < 50) break;
        order += items.length;
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
