// ==UserScript==
// @name         Kemono助手
// @version      2.0.0
// @description  提供更好的Kemono使用体验
// @author       ZIDOUZI
// @match        https://*.kemono.party/*
// @match        https://*.kemono.su/*
// @icon         https://kemono.su/static/favicon.ico
// @require      https://cdn.jsdelivr.net/npm/sweetalert2@11
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @namespace https://greasyfork.org/users/448292
// @downloadURL https://update.greasyfork.org/scripts/468718/Kemono%E5%8A%A9%E6%89%8B.user.js
// @updateURL https://update.greasyfork.org/scripts/468718/Kemono%E5%8A%A9%E6%89%8B.meta.js
// ==/UserScript==

(async function () {

    const language = navigator.language || navigator.userLanguage;

    const domain = window.location.href.match(/https:\/\/([^/]+)/)[1];

    const data = await (async () => {
        let _vimMode = GM_getValue('vimMode', false)
        let _rpc = GM_getValue('rpc', 'http://localhost:6800/jsonrpc')
        let _token = GM_getValue('token', '')
        let _dir = GM_getValue('dir', '')
        if (_dir === '') {
            _dir = await fetchDownloadDir(_rpc, _token) + "/kemono/{service}-{artist_id}/{post}-{post_id}/{index0}.{extension}";
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
                _dir = value;
                GM_setValue('dir', value);
            }, format(date) {
                const year = date.getFullYear();
                const month = date.getMonth() + 1;
                const day = date.getDate();
                const hour = date.getHours();
                const minute = date.getMinutes();
                const second = date.getSeconds();
                return `${year}-${month}-${day} ${hour}-${minute}-${second}`; // TODO: custom format
            }, formatDir(post, index, name, artist = undefined, padStart = 3) {
                const indexString = index.toString().padStart(padStart, '0');
                return _dir
                    .replace('{service}', post.service)
                    .replace('{artist_id}', post.user)
                    .replace('{date}', this.format(new Date(Date.parse(post.published))))
                    .replace('{post}', post.title)
                    .replace('{post_id}', post.id)
                    .replace('{time}', this.format(new Date()))
                    .replace('{index0}', indexString)
                    .replace('{index}', index === 0 ? '' : indexString)
                    .replace('{name}', name.slice(0, name.lastIndexOf(".")))
                    .replace('{extension}', name.slice(name.lastIndexOf(".") + 1));
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
        if (Object.keys(post.file).length !== 0) post.attachments.push(post.file)
        for (let [i, {name, path}] of post.attachments.entries()) {
            await downloadContent(data.rpc, data.token, data.formatDir(post, i, name), `https://${domain}/data${path}`);
        }
    }

    let mode;
    let header;
    let listener;
    if (window.location.href.match(/\/user\/\w+\/post\/\w+/)) {
        mode = 'post';
        header = document.querySelector('.post__actions');
        listener = async () => await downloadPostContent(await (await fetch(`/api/v1/${window.location.pathname}`)).json())
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
        settings.textContent = '⚙';
        settings.style = header.style
        settings.addEventListener('click', showDialog);

        const download = document.createElement('button');
        download.classList.add(`${mode}-header__download`);
        download.innerHTML = `
            <span class="${mode}-header__download-icon">⬇</span>
            <span class="${mode}-header__download-text">下载</span>
        `;

        download.addEventListener('click', listener);

        header.appendChild(settings);
        header.appendChild(download);
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
                    <textarea cols="20" id="dir">${data.dir}</textarea>
                    <icon title=""></icon>
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

})();

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
                        reject({status: response.status, statusText: response.statusText})
                    }
                }, onerror: function (response) {
                    reject({status: response.status, statusText: response.statusText})
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
        if (response.status !== 200) throw {status: response.status, statusText: response.statusText}
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
            ? [url, {"dir": dir}]
            : [url, {"dir": dir, "out": out}]
        : out === ""
            ? [`token:${token}`, url, {"dir": dir}]
            : [`token:${token}`, url, {"dir": dir, "out": out}]
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: "POST", url: rpc, data: JSON.stringify({
                jsonrpc: "2.0", id: `kemono-${crypto.randomUUID()}`, method: "aria2.addUri", params: params
            }), onload: function (response) {
                if (response.status === 200) {
                    resolve(JSON.parse(response.responseText))
                } else {
                    reject({status: response.status, statusText: response.statusText})
                }
            }, onerror: function (response) {
                reject({status: response.status, statusText: response.statusText})
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
                    reject({status: response.status, statusText: response.statusText})
                }
            }, onerror: function (response) {
                reject({status: response.status, statusText: response.statusText})
            }
        })
    }).then(function (result) {
        return result.result.dir;
    })
}
