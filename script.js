// Discord User ID
const DISCORD_USER_ID = '306747071640240138';

// Lanyard WebSocket
const LANYARD_WS_URL = 'wss://api.lanyard.rest/socket';
const CDN = 'https://cdn.discordapp.com';

// 프로필 효과 "Playground Pals" (불러오기 실패 시 기본값)
const DEFAULT_EFFECT_SKU = '1488248082951835748';
const NITRO_BADGE_ICON = '2ba85e8026a8614b640c2837bcdfe21b';

// DOM Elements
const $ = (id) => document.getElementById(id);
// 프사와 상태 점은 카드와 접힌 버튼에 하나씩 있음
const avatars = document.querySelectorAll('.avatar');
const avatarDeco = $('avatar-deco');
const statusDots = document.querySelectorAll('.status-dot');
const statusText = $('status-text');
const deviceText = $('device');
const activitySection = $('activity-section');
const spotifySection = $('spotify-section');

let currentActivityStart = null;
let spotifyInterval = null;
let isDragging = false;

// 상태 텍스트 변환
function getStatusText(status) {
    const statusMap = {
        'online': '온라인',
        'idle': '자리 비움',
        'dnd': '방해 금지',
        'offline': '오프라인'
    };
    return statusMap[status] || '오프라인';
}

// 시간 포맷
function formatTime(ms) {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor(ms / 1000 / 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// 경과 시간 계산
function getElapsedTime(startTimestamp) {
    const elapsed = Math.max(0, Date.now() - startTimestamp);
    const minutes = Math.floor((elapsed / 1000 / 60) % 60);
    const hours = Math.floor(elapsed / 1000 / 60 / 60);

    if (hours > 0) {
        return `${hours}시간 ${minutes}분째`;
    }
    if (minutes > 0) {
        return `${minutes}분째`;
    }
    return '방금 시작';
}

// 활동 이미지 주소 변환
function resolveAssetUrl(image, applicationId) {
    if (!image) return null;
    if (image.startsWith('mp:external/')) {
        return `https://media.discordapp.net/external/${image.replace('mp:external/', '')}`;
    }
    if (image.startsWith('spotify:')) {
        return `https://i.scdn.co/image/${image.replace('spotify:', '')}`;
    }
    if (image.startsWith('http')) {
        return image;
    }
    return `${CDN}/app-assets/${applicationId}/${image}.png`;
}

// 프로필 정보
function updateProfile(user) {
    const name = user.display_name || user.global_name || user.username;
    $('display-name').textContent = name;
    // '복사했어요'가 떠 있는 동안은 건드리지 않음
    if (!$('handle').classList.contains('is-copied')) {
        $('handle').textContent = `@${user.username}`;
    }
    $('handle').dataset.username = user.username;
    document.title = name;

    let avatarUrl;
    if (user.avatar) {
        avatarUrl = user.avatar.startsWith('a_')
            ? `${CDN}/avatars/${user.id}/${user.avatar}.webp?size=256&animated=true`
            : `${CDN}/avatars/${user.id}/${user.avatar}.png?size=256`;
        $('favicon').href = `${CDN}/avatars/${user.id}/${user.avatar}.png?size=64`;
    } else {
        // 새 아이디 체계의 기본 프로필 사진
        avatarUrl = `${CDN}/embed/avatars/${Number((BigInt(user.id) >> 22n) % 6n)}.png`;
    }
    avatars.forEach((img) => {
        if (img.src !== avatarUrl) img.src = avatarUrl;
    });

    // 아바타 장식
    const deco = user.avatar_decoration_data;
    if (deco?.asset) {
        const decoUrl = `${CDN}/avatar-decoration-presets/${deco.asset}.png?size=240&passthrough=true`;
        if (avatarDeco.src !== decoUrl) avatarDeco.src = decoUrl;
        avatarDeco.hidden = false;
    } else {
        avatarDeco.hidden = true;
    }

    // 명패
    const identity = $('identity');
    const nameplate = $('nameplate');
    const plate = user.collectibles?.nameplate;
    if (plate?.asset) {
        const base = `${CDN}/assets/collectibles/${plate.asset}`;
        if (nameplate.dataset.asset !== plate.asset) {
            nameplate.dataset.asset = plate.asset;
            nameplate.poster = `${base}static.png`;
            nameplate.src = `${base}asset.webm`;
            nameplate.play().catch(() => {});
        }
        nameplate.title = plate.label || '';
        nameplate.hidden = false;
        identity.classList.add('has-plate');
    } else {
        nameplate.hidden = true;
        identity.classList.remove('has-plate');
    }

    // 서버 태그
    const guild = user.primary_guild;
    const guildTag = $('guild-tag');
    if (guild?.identity_enabled && guild.tag) {
        $('guild-tag-text').textContent = guild.tag;
        const badge = $('guild-badge');
        if (guild.badge) {
            badge.src = `${CDN}/clan-badges/${guild.identity_guild_id}/${guild.badge}.png?size=32`;
            badge.hidden = false;
        } else {
            badge.hidden = true;
        }
        guildTag.hidden = false;
    } else {
        guildTag.hidden = true;
    }
}

// 커스텀 상태
function updateCustomStatus(activity) {
    const box = $('custom-status');
    const emoji = $('custom-status-emoji');
    const text = $('custom-status-text');

    if (!activity || (!activity.state && !activity.emoji)) {
        box.hidden = true;
        return;
    }

    text.textContent = activity.state || '';
    emoji.hidden = true;

    if (activity.emoji?.id) {
        emoji.src = `${CDN}/emojis/${activity.emoji.id}.${activity.emoji.animated ? 'gif' : 'png'}?size=48`;
        emoji.alt = activity.emoji.name || '';
        emoji.hidden = false;
    } else if (activity.emoji?.name) {
        text.textContent = `${activity.emoji.name} ${text.textContent}`.trim();
    }

    box.hidden = false;
}

// 활동 업데이트
function updateActivity(activity) {
    if (!activity) {
        activitySection.hidden = true;
        currentActivityStart = null;
        return;
    }

    const typeMap = {
        0: '플레이 중',
        1: '방송 중',
        2: '듣는 중',
        3: '시청 중',
        5: '경쟁 중'
    };
    $('activity-type').textContent = typeMap[activity.type] || '활동 중';
    $('activity-name').textContent = activity.name;
    $('activity-details').textContent = activity.details || '';
    $('activity-state').textContent = activity.state || '';

    // 시간 표시
    currentActivityStart = activity.timestamps?.start || null;
    $('activity-time').textContent = currentActivityStart ? getElapsedTime(currentActivityStart) : '';

    // 이미지 (없으면 게임패드 아이콘)
    const activityImage = $('activity-image');
    const fallback = $('activity-fallback');
    const imageUrl = resolveAssetUrl(activity.assets?.large_image || activity.assets?.small_image, activity.application_id);

    if (imageUrl) {
        activityImage.onerror = () => {
            activityImage.hidden = true;
            fallback.hidden = false;
        };
        activityImage.src = imageUrl;
        activityImage.hidden = false;
        fallback.hidden = true;
    } else {
        activityImage.hidden = true;
        fallback.hidden = false;
    }

    activitySection.hidden = false;
}

// Spotify 업데이트
function updateSpotify(spotify) {
    clearInterval(spotifyInterval);

    if (!spotify) {
        spotifySection.hidden = true;
        return;
    }

    $('song-name').textContent = spotify.song;
    $('artist-name').textContent = spotify.artist.replace(/;/g, ',');
    $('album-art').src = spotify.album_art_url;
    spotifySection.href = `https://open.spotify.com/track/${spotify.track_id}`;
    spotifySection.hidden = false;

    const progressBar = $('progress-bar');
    const currentTime = $('current-time');
    const totalTime = $('total-time');

    const updateProgress = () => {
        const total = spotify.timestamps.end - spotify.timestamps.start;
        const elapsed = Math.min(Date.now() - spotify.timestamps.start, total);

        progressBar.style.width = (elapsed / total) * 100 + '%';
        currentTime.textContent = formatTime(elapsed);
        totalTime.textContent = formatTime(total);
    };

    updateProgress();
    spotifyInterval = setInterval(updateProgress, 1000);
}

// Lanyard 데이터 처리
function handleLanyardData(data) {
    const { discord_user, discord_status, activities = [], spotify } = data;

    if (discord_user) {
        updateProfile(discord_user);
    }

    // 상태
    statusDots.forEach((dot) => {
        dot.className = 'status-dot ' + discord_status;
    });
    statusText.textContent = getStatusText(discord_status);

    // 접속 기기
    let device = '';
    if (discord_status !== 'offline') {
        if (data.active_on_discord_desktop) device = 'PC';
        else if (data.active_on_discord_mobile) device = '모바일';
        else if (data.active_on_discord_web) device = '웹';
    }
    deviceText.textContent = device;

    // 커스텀 상태는 따로, Spotify는 전용 카드로
    updateCustomStatus(activities.find(a => a.type === 4));
    updateSpotify(spotify);
    updateActivity(activities.find(a => a.type !== 4 && !(spotify && a.id === 'spotify:1')));
}

// WebSocket 연결
function connectLanyard() {
    const ws = new WebSocket(LANYARD_WS_URL);
    let heartbeatInterval;

    ws.onmessage = (event) => {
        const { op, d } = JSON.parse(event.data);

        switch (op) {
            case 1: // Hello
                heartbeatInterval = setInterval(() => {
                    ws.send(JSON.stringify({ op: 3 }));
                }, d.heartbeat_interval);

                ws.send(JSON.stringify({
                    op: 2,
                    d: { subscribe_to_id: DISCORD_USER_ID }
                }));
                break;

            case 0: // Event
                if (d) handleLanyardData(d);
                break;
        }
    };

    ws.onclose = () => {
        clearInterval(heartbeatInterval);
        setTimeout(connectLanyard, 5000);
    };
}

// 테마 색 (디스코드 숫자 색 → CSS 변수)
function setThemeColors([primary, accent]) {
    const toRgb = (n) => `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
    document.documentElement.style.setProperty('--theme-1', toRgb(primary));
    document.documentElement.style.setProperty('--theme-2', toRgb(accent));
}

// 디스코드 프로필 효과 (등장 애니메이션만 한 번, 입장한 뒤에)
async function playProfileEffect(skuId, entered) {
    let item;
    try {
        const res = await fetch(`https://discord.com/api/v9/collectibles-products/${skuId}`);
        if (!res.ok) return;
        item = (await res.json()).items?.find(i => i.type === 1);
    } catch {
        return;
    }
    if (!item) return;

    const box = $('profile-effect');
    const makeLayer = (src) => {
        const img = new Image();
        img.alt = '';
        img.draggable = false;
        img.src = src;
        return img;
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        if (item.reducedMotionSrc) box.append(makeLayer(item.reducedMotionSrc));
        return;
    }

    // 반복 애니메이션은 빼고, 다 받은 뒤에 시작해야 중간에 잘리지 않음
    const layers = (item.effects || [])
        .filter(effect => !effect.loop)
        .map(effect => ({ effect, img: makeLayer(effect.src) }));
    await Promise.all(layers.map(({ img }) => img.decode().catch(() => {})));
    await entered;

    layers.forEach(({ effect, img }) => {
        img.style.zIndex = effect.zIndex;
        setTimeout(() => {
            box.append(img);
            setTimeout(() => img.remove(), effect.duration);
        }, effect.start);
    });
}

// 배지
function renderBadges(list) {
    const box = $('badges');
    box.replaceChildren(...list.map(({ icon, label }) => {
        const img = new Image();
        img.src = `${CDN}/badge-icons/${icon}.png`;
        img.alt = label;
        img.title = label;
        img.draggable = false;
        return img;
    }));
    box.hidden = list.length === 0;
}

// 배너·테마 색·프로필 효과 (Lanyard엔 없어서 dstn.to에서 가져옴)
async function loadProfileExtras(entered) {
    const banner = $('banner');
    const fallback = 'assets/banner.jpg';

    // 못 불러오면 하늘 사진으로
    banner.addEventListener('error', () => {
        if (banner.getAttribute('src') !== fallback) banner.src = fallback;
    });

    let profile = null;
    try {
        const res = await fetch(`https://dcdn.dstn.to/profile/${DISCORD_USER_ID}`);
        if (res.ok) profile = await res.json();
    } catch {
        // 실패하면 처음 넣어둔 배너·색·효과 그대로
    }

    if (profile) {
        const hash = profile.user_profile?.banner || profile.user?.banner;
        let url = fallback;
        if (hash) {
            url = hash.startsWith('a_')
                ? `${CDN}/banners/${DISCORD_USER_ID}/${hash}.webp?size=1024&animated=true`
                : `${CDN}/banners/${DISCORD_USER_ID}/${hash}.png?size=1024`;
        }
        if (banner.getAttribute('src') !== url) banner.src = url;

        const colors = profile.user_profile?.theme_colors;
        if (colors?.length === 2) setThemeColors(colors);

        // 공개된 배지가 없으면 니트로만 표시
        const badges = profile.badges?.length
            ? profile.badges.map(b => ({ icon: b.icon, label: b.description }))
            : profile.premium_type ? [{ icon: NITRO_BADGE_ICON, label: 'Nitro 구독자' }] : [];
        renderBadges(badges);
    }

    const effectSku = profile ? profile.user_profile?.profile_effect?.sku_id : DEFAULT_EFFECT_SKU;
    if (effectSku) playProfileEffect(effectSku, entered);
}

// 입장 화면: 누르면 걷히고 음악 시작 (music.js가 'site-enter'를 받음)
function initIntro() {
    const intro = $('intro');
    intro.focus({ preventScroll: true });

    return new Promise((resolve) => {
        intro.addEventListener('click', () => {
            document.dispatchEvent(new Event('site-enter'));
            document.body.classList.remove('is-intro');
            intro.classList.add('is-leaving');
            setTimeout(() => intro.remove(), 600);
            resolve();
        }, { once: true });
    });
}

// 아이디 복사
function initHandleCopy() {
    const handle = $('handle');
    let timer = null;

    handle.addEventListener('click', async () => {
        const username = handle.dataset.username || handle.textContent.replace('@', '');
        try {
            await navigator.clipboard.writeText(username);
        } catch {
            return;
        }

        // 연달아 눌러도 원래 아이디로 돌아오게 타이머를 새로 잡음
        clearTimeout(timer);
        handle.classList.add('is-copied');
        handle.textContent = '복사했어요';
        timer = setTimeout(() => {
            handle.classList.remove('is-copied');
            handle.textContent = `@${handle.dataset.username || username}`;
        }, 1500);
    });
}

// 프로필 카드 접기 (카드 전체가 동그란 프사 버튼으로 바뀜)
function initFold(onToggle) {
    const page = $('page');
    const card = $('card');
    const foldBtn = $('fold-btn');
    const bubble = $('fold-bubble');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function fold() {
        card.classList.remove('is-closing');
        page.classList.add('is-folded');
        bubble.focus({ preventScroll: true });
        onToggle();
    }

    foldBtn.addEventListener('click', () => {
        if (reduceMotion) {
            fold();
            return;
        }
        // 줄어드는 애니메이션이 끝나면 접기
        card.classList.add('is-closing');
        card.addEventListener('animationend', fold, { once: true });
    });

    bubble.addEventListener('click', () => {
        page.classList.remove('is-folded');
        foldBtn.focus({ preventScroll: true });
        onToggle();
    });
}

// 카드 끌어서 옮기기 (새로고침하면 가운데로 돌아옴)
function initDrag() {
    const page = $('page');
    const card = $('card');
    const bubble = $('fold-bubble');
    let offsetX = 0;
    let offsetY = 0;
    let start = null;

    // 보이는 쪽(카드 또는 접힌 프사)이 화면 밖으로 나가지 않게
    function clamp(x, y) {
        const target = page.classList.contains('is-folded') ? bubble : card;
        const rect = target.getBoundingClientRect();
        // 애니메이션 중 크기 변화는 무시하고 원래 크기로 계산
        const width = target.offsetWidth;
        const height = target.offsetHeight;
        const baseLeft = (rect.left + rect.right) / 2 - width / 2 - offsetX;
        const baseTop = (rect.top + rect.bottom) / 2 - height / 2 - offsetY;
        const viewWidth = document.documentElement.clientWidth;
        const viewHeight = document.documentElement.clientHeight;

        // 화면보다 크면 위 끝~아래 끝이 보이는 범위까지만
        const limit = (value, base, size, view) => {
            const a = -base;
            const b = view - size - base;
            return Math.min(Math.max(value, Math.min(a, b)), Math.max(a, b));
        };

        return [limit(x, baseLeft, width, viewWidth), limit(y, baseTop, height, viewHeight)];
    }

    function moveTo(x, y) {
        [offsetX, offsetY] = clamp(x, y);
        page.style.translate = `${offsetX}px ${offsetY}px`;
    }

    page.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        // 링크와 버튼은 원래대로 (접힌 프사는 끌 수도 있음)
        if (e.target.closest('a, input, button:not(.fold-bubble)')) return;

        start = {
            id: e.pointerId,
            downX: e.clientX,
            downY: e.clientY,
            x: e.clientX - offsetX,
            y: e.clientY - offsetY
        };
    });

    page.addEventListener('pointermove', (e) => {
        if (!start || e.pointerId !== start.id) return;

        if (!isDragging) {
            // 살짝 움직인 건 클릭으로 처리
            if (Math.hypot(e.clientX - start.downX, e.clientY - start.downY) < 6) return;
            isDragging = true;
            page.setPointerCapture(e.pointerId);
            document.body.classList.add('is-dragging');
            window.getSelection()?.removeAllRanges();
        }

        moveTo(e.clientX - start.x, e.clientY - start.y);
    });

    function end(e) {
        if (!start || e.pointerId !== start.id) return;
        start = null;
        if (!isDragging) return;

        isDragging = false;
        document.body.classList.remove('is-dragging');

        // 놓을 때 따라오는 클릭(프사 펼치기 등)은 무시
        const swallow = (ev) => {
            ev.stopPropagation();
            ev.preventDefault();
        };
        window.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
    }

    page.addEventListener('pointerup', end);
    page.addEventListener('pointercancel', end);

    const keepInView = () => moveTo(offsetX, offsetY);
    window.addEventListener('resize', keepInView);
    return keepInView;
}

// 카드 틸트 효과 (마우스 있는 기기에서만)
function initCardTilt() {
    const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!canHover || reduceMotion) return;

    const card = $('card');
    const maxRotation = 4;
    let currentX = 0;
    let currentY = 0;
    let targetX = 0;
    let targetY = 0;
    let running = false;

    // 목표 각도에 가까워지면 루프 정지
    function animate() {
        currentX += (targetX - currentX) * 0.08;
        currentY += (targetY - currentY) * 0.08;
        card.style.transform = `perspective(1000px) rotateX(${currentY}deg) rotateY(${currentX}deg)`;

        if (Math.abs(targetX - currentX) > 0.01 || Math.abs(targetY - currentY) > 0.01) {
            requestAnimationFrame(animate);
        } else {
            running = false;
        }
    }

    function start() {
        if (!running) {
            running = true;
            requestAnimationFrame(animate);
        }
    }

    document.addEventListener('mousemove', (e) => {
        // 끄는 동안은 평평하게
        if (isDragging) {
            targetX = 0;
            targetY = 0;
            start();
            return;
        }
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        targetX = ((e.clientX - centerX) / centerX) * maxRotation;
        targetY = -((e.clientY - centerY) / centerY) * maxRotation;
        start();
    });

    document.addEventListener('mouseleave', () => {
        targetX = 0;
        targetY = 0;
        start();
    });
}

// 배경 영상 (동작 줄이기 설정이면 정지 화면)
function initBackground() {
    const video = $('bg-video');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        video.pause();
        video.removeAttribute('autoplay');
        return;
    }
    video.play().catch(() => {});
}

// 활동 시간 업데이트
setInterval(() => {
    if (!activitySection.hidden && currentActivityStart) {
        $('activity-time').textContent = getElapsedTime(currentActivityStart);
    }
}, 1000);

// 초기화
document.addEventListener('DOMContentLoaded', () => {
    const entered = initIntro();
    initBackground();
    initHandleCopy();
    initFold(initDrag());
    initCardTilt();
    loadProfileExtras(entered);
    connectLanyard();
});
