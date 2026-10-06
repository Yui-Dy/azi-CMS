// 배경음악 목록 (곡을 추가하려면 assets/music에 파일을 넣고 여기에 한 줄 추가)
const TRACKS = [
    {
        src: 'assets/music/dancing-falsehood.m4a',
        cover: 'assets/music/dancing-falsehood.jpg',
        title: 'Dancing Falsehood',
        artist: 'Blue Archive OST'
    }
];

const bgm = new Audio();
bgm.preload = 'auto';

let currentTrack = -1;
let isSeeking = false;

// 곡 재생 / 정지
function playTrack(index) {
    if (index === currentTrack) {
        if (bgm.paused) return bgm.play();
        bgm.pause();
        return Promise.resolve();
    }

    currentTrack = index;
    bgm.src = TRACKS[index].src;
    // 한 곡뿐이면 계속 반복
    bgm.loop = TRACKS.length === 1;
    $('music-error').hidden = true;
    const playing = bgm.play();
    renderPlaylist();
    return playing;
}

// 입장 화면을 누르면 재생 (그래도 막히면 화면을 다시 누를 때 시작)
function startAutoplay() {
    const events = ['pointerup', 'touchend', 'keydown'];
    const stop = () => events.forEach(type => window.removeEventListener(type, unlock, true));
    function unlock(e) {
        // 목록의 재생 버튼은 직접 재생/정지를 처리하니 맡김
        if (e.target.closest?.('#playlist')) {
            stop();
            return;
        }
        bgm.play().then(stop, () => {});
    }

    playTrack(0).catch(() => {
        events.forEach(type => window.addEventListener(type, unlock, true));
    });
}

function renderPlaylist() {
    const playing = !bgm.paused;

    $('playlist').replaceChildren(...TRACKS.map((track, index) => {
        const active = index === currentTrack;

        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'track' + (active ? ' is-active' : '');
        button.setAttribute('aria-label', `${track.title} ${active && playing ? '정지' : '재생'}`);
        button.innerHTML = `
            <img class="track-cover" alt="" draggable="false">
            <span class="track-text">
                <span class="track-title"></span>
                <span class="track-artist"></span>
            </span>
            <i class="fa-solid ${active && playing ? 'fa-pause' : 'fa-play'}"></i>
        `;
        button.querySelector('.track-cover').src = track.cover;
        button.querySelector('.track-title').textContent = track.title;
        button.querySelector('.track-artist').textContent = track.artist;
        button.addEventListener('click', () => playTrack(index).catch(() => {}));

        li.append(button);
        return li;
    }));
}

// 슬라이더 왼쪽(채워진 부분) 색칠
function paintRange(input) {
    input.style.setProperty('--fill', `${(input.value / input.max) * 100}%`);
}

// 재생 위치 표시
function updateProgress() {
    const duration = bgm.duration || 0;
    $('music-duration').textContent = formatTime(duration * 1000);
    if (isSeeking) return;
    const seek = $('music-seek');
    $('music-current').textContent = formatTime(bgm.currentTime * 1000);
    seek.value = duration ? Math.round((bgm.currentTime / duration) * 1000) : 0;
    paintRange(seek);
}

function setPlayingState() {
    $('music-btn').classList.toggle('is-playing', !bgm.paused);
    renderPlaylist();
}

// 동그란 버튼으로 패널 열고 닫기
function initMusic() {
    const music = $('music');
    const button = $('music-btn');
    const seek = $('music-seek');
    const volume = $('music-volume');

    function setOpen(open) {
        music.classList.toggle('is-open', open);
        button.setAttribute('aria-expanded', String(open));
    }

    button.addEventListener('click', () => {
        setOpen(!music.classList.contains('is-open'));
    });

    // 바깥을 누르거나 Esc로 닫기 (음악은 계속 재생)
    document.addEventListener('pointerdown', (e) => {
        if (!music.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') setOpen(false);
    });

    // 재생 위치 옮기기 (끄는 동안은 시간만 미리 보여줌)
    seek.addEventListener('input', () => {
        isSeeking = true;
        paintRange(seek);
        if (bgm.duration) {
            $('music-current').textContent = formatTime((seek.value / 1000) * bgm.duration * 1000);
        }
    });
    seek.addEventListener('change', () => {
        if (bgm.duration) bgm.currentTime = (seek.value / 1000) * bgm.duration;
        isSeeking = false;
    });

    bgm.volume = volume.value / 100;
    paintRange(volume);
    volume.addEventListener('input', () => {
        bgm.volume = volume.value / 100;
        paintRange(volume);
    });

    bgm.addEventListener('play', setPlayingState);
    bgm.addEventListener('pause', setPlayingState);
    bgm.addEventListener('timeupdate', updateProgress);
    bgm.addEventListener('loadedmetadata', updateProgress);
    // 여러 곡이면 다음 곡으로
    bgm.addEventListener('ended', () => {
        const next = (currentTrack + 1) % TRACKS.length;
        currentTrack = -1;
        playTrack(next).catch(() => {});
    });
    bgm.addEventListener('error', () => {
        if (!bgm.getAttribute('src')) return;
        $('music-error').hidden = false;
        setPlayingState();
    });

    renderPlaylist();
    document.addEventListener('site-enter', startAutoplay, { once: true });
}

document.addEventListener('DOMContentLoaded', initMusic);
