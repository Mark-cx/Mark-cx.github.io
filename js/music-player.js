/* global document, window */

(function() {
  const cfgScript = document.querySelector('script.next-config[data-name="music_player"]');
  if (!cfgScript) return;

  let cfg = null;
  try {
    cfg = JSON.parse(cfgScript.textContent || '{}');
  } catch (e) {
    return;
  }

  const root = document.getElementById('music-player');
  if (!root) return;

  const playlist = Array.isArray(cfg.playlist) ? cfg.playlist : [];

  const toggleBtn = root.querySelector('.js-music-toggle');
  const select = root.querySelector('.js-music-select');
  const audio = root.querySelector('.js-music-audio');
  const seek = root.querySelector('.js-music-seek');
  const currentEl = root.querySelector('.js-music-current');
  const durationEl = root.querySelector('.js-music-duration');

  const icon = toggleBtn && toggleBtn.querySelector('i');
  const SEEK_MAX = 1000;

  function formatTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function setIcon(isPlaying) {
    if (!icon) return;
    icon.classList.toggle('fa-play', !isPlaying);
    icon.classList.toggle('fa-pause', isPlaying);
  }

  function loadTrack(index, autoplay) {
    const track = playlist[index];
    if (!track || !track.url) return;

    audio.src = track.url;
    audio.load();
    if (typeof select !== 'undefined' && select) select.value = String(index);

    if (autoplay) {
      // Autoplay may be blocked by the browser; ignore failures.
      audio.play().then(() => setIcon(true)).catch(() => setIcon(false));
    } else {
      setIcon(!audio.paused);
    }
  }

  function updateSeek() {
    if (!audio.duration || Number.isNaN(audio.duration)) return;
    const ratio = audio.currentTime / audio.duration;
    seek.value = String(Math.floor(ratio * SEEK_MAX));
    currentEl.textContent = formatTime(audio.currentTime);
  }

  function updateDuration() {
    durationEl.textContent = formatTime(audio.duration);
  }

  function showNoTracks() {
    if (!select) return;
    select.innerHTML = '<option value="">No tracks</option>';
    if (toggleBtn) toggleBtn.disabled = true;
  }

  if (!playlist.length) {
    showNoTracks();
    return;
  }

  // Populate select
  select.innerHTML = playlist.map((t, i) => {
    const title = t && t.title ? t.title : `Track ${i + 1}`;
    return `<option value="${i}">${title}</option>`;
  }).join('');

  // Initial load
  loadTrack(0, false);

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      if (!audio.src) loadTrack(0, false);
      if (audio.paused) {
        audio.play().then(() => setIcon(true)).catch(() => setIcon(false));
      } else {
        audio.pause();
        setIcon(false);
      }
    });
  }

  if (select) {
    select.addEventListener('change', () => {
      const idx = Number(select.value);
      if (!Number.isFinite(idx)) return;
      loadTrack(idx, true);
    });
  }

  if (seek) {
    seek.max = String(SEEK_MAX);
    seek.value = '0';
    seek.addEventListener('input', () => {
      if (!audio.duration || Number.isNaN(audio.duration)) return;
      const ratio = Number(seek.value) / SEEK_MAX;
      audio.currentTime = ratio * audio.duration;
      updateSeek();
    });
  }

  audio.addEventListener('timeupdate', updateSeek);
  audio.addEventListener('loadedmetadata', updateDuration);

  audio.addEventListener('play', () => setIcon(true));
  audio.addEventListener('pause', () => setIcon(false));

  audio.addEventListener('ended', () => {
    const idx = Number(select.value);
    const next = Number.isFinite(idx) ? idx + 1 : 1;
    const nextIdx = next >= playlist.length ? 0 : next;
    loadTrack(nextIdx, true);
  });

  audio.addEventListener('error', () => {
    // Don't throw; just stop the player.
    setIcon(false);
  });
})();

