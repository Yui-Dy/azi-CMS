// Firebase Realtime Database 주소 (비어 있으면 방문자 수·하트를 숨김)
// 예: https://azi-nyang-default-rtdb.asia-southeast1.firebasedatabase.app
const FIREBASE_DB_URL = 'https://azinyangw-default-rtdb.asia-southeast1.firebasedatabase.app';

// 한 번에 보내는 하트 최대 개수 (Firebase 규칙과 같아야 함)
const MAX_HEARTS_PER_SEND = 50;

const stats = { visits: 0, hearts: 0 };
let pendingHearts = 0;
let sendingHearts = 0;
let sendTimer = null;

const statsUrl = () => `${FIREBASE_DB_URL.replace(/\/$/, '')}/stats.json`;

function formatCount(n) {
    return Number(n || 0).toLocaleString('ko-KR');
}

// 보내는 중인 하트까지 더해서 바로 보여줌
function renderStats() {
    $('visit-count').textContent = formatCount(stats.visits);
    $('heart-count').textContent = formatCount(stats.hearts + pendingHearts + sendingHearts);
}

function increment(field, amount, keepalive = false) {
    return fetch(statsUrl(), {
        method: 'PATCH',
        body: JSON.stringify({ [field]: { '.sv': { increment: amount } } }),
        keepalive
    });
}

// 방문자 수: 같은 브라우저는 하루에 한 번만
function countVisit() {
    const today = new Date().toISOString().slice(0, 10);
    try {
        if (localStorage.getItem('visited') === today) return;
        localStorage.setItem('visited', today);
    } catch {
        // 저장소를 못 쓰면 그냥 셈
    }
    increment('visits', 1).catch(() => {});
}

// 실시간으로 숫자 받기
function listenStats() {
    const source = new EventSource(statsUrl());
    const apply = (e) => {
        const { path, data } = JSON.parse(e.data);
        if (path === '/') Object.assign(stats, data || {});
        else stats[path.slice(1)] = data;
        renderStats();
    };
    source.addEventListener('put', apply);
    source.addEventListener('patch', apply);
}

// 하트: 연타한 만큼 모아서 조금씩 보냄
function sendHearts() {
    sendTimer = null;
    const amount = Math.min(pendingHearts, MAX_HEARTS_PER_SEND);
    if (!amount) return;

    pendingHearts -= amount;
    sendingHearts += amount;
    increment('hearts', amount)
        .catch(() => {})
        .finally(() => {
            sendingHearts -= amount;
            renderStats();
            if (pendingHearts) sendTimer = setTimeout(sendHearts, 300);
        });
}

// 누를 때마다 작은 하트가 위로 떠오름
function floatHeart(button) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const heart = document.createElement('i');
    heart.className = 'fa-solid fa-heart heart-float';
    heart.style.setProperty('--drift', `${Math.round(Math.random() * 24 - 12)}px`);
    button.append(heart);
    heart.addEventListener('animationend', () => heart.remove());
}

function initCounter() {
    if (!FIREBASE_DB_URL) return;

    const button = $('heart-btn');
    $('stats').hidden = false;

    countVisit();
    listenStats();

    button.addEventListener('click', () => {
        pendingHearts++;
        renderStats();
        floatHeart(button);

        // 눌릴 때마다 살짝 튀게 (애니메이션 다시 시작)
        button.classList.remove('is-pop');
        void button.offsetWidth;
        button.classList.add('is-pop');

        if (!sendTimer) sendTimer = setTimeout(sendHearts, 700);
    });

    // 창을 닫을 때 남은 하트도 보냄
    window.addEventListener('pagehide', () => {
        if (pendingHearts) increment('hearts', Math.min(pendingHearts, MAX_HEARTS_PER_SEND), true).catch(() => {});
    });
}

document.addEventListener('DOMContentLoaded', initCounter);
