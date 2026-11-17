"""Original soundtrack for the ad, synthesised from scratch (no samples, no licence).

    python3 scripts/music.py        # writes public/audio/Ad30.m4a and Ad15.m4a

120 BPM, so every scene cut (src/timings.ts) falls on a beat:
  0–3 s   ticking clock and a tense drone (the mess), rising into the cut
  3 s     warm chords and a plucked arpeggio (the app takes over)
  11 s    kick, hats and bass join (email)
  18 s    claps, full groove (accountant)
  25 s    resolves on one held chord (end card)
Sound effects follow the animation's own frames: the shutter, the fields
appearing, Save, the emails landing, the confirm taps and the export.
Event frames are copied from the scene files; keep them in step when timings change.
"""

import os
import subprocess
import wave

import numpy as np

SR = 44100
BPM = 120
BEAT = 60 / BPM
BAR = BEAT * 4
FPS = 30
rng = np.random.default_rng(7)


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def env_adsr(n, a, r, sustain=1.0):
    e = np.ones(n) * sustain
    na, nr = int(a * SR), int(r * SR)
    na, nr = min(na, n), min(nr, n)
    if na:
        e[:na] = np.linspace(0, sustain, na)
    if nr:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


def one_pole_lowpass(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


class Track:
    def __init__(self, seconds):
        self.n = int(seconds * SR)
        self.dry = np.zeros((self.n, 2))
        self.wet = np.zeros((self.n, 2))

    def add(self, t, sig, gain=1.0, pan=0.0, send=0.25):
        i = int(t * SR)
        if i >= self.n:
            return
        sig = sig[: self.n - i]
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        stereo = np.stack([sig * l, sig * r], axis=1) * gain
        self.dry[i : i + len(sig)] += stereo
        self.wet[i : i + len(sig)] += stereo * send

    def mix(self):
        out = self.dry + reverb(self.wet)
        out = np.tanh(out * 1.2)
        peak = np.max(np.abs(out)) or 1.0
        return out / peak * 0.89


def reverb(x, seconds=1.8):
    n_ir = int(seconds * SR)
    t = np.arange(n_ir) / SR
    out = np.zeros_like(x)
    for ch in range(2):
        ir = rng.standard_normal(n_ir) * np.exp(-t * 3.2)
        ir = one_pole_lowpass(ir, 5000)
        ir /= np.sqrt(np.sum(ir**2))
        size = 1 << int(np.ceil(np.log2(len(x) + n_ir)))
        y = np.fft.irfft(np.fft.rfft(x[:, ch], size) * np.fft.rfft(ir, size), size)
        out[:, ch] = y[: len(x)] * 0.9
    return out


# --- instruments -----------------------------------------------------------

def pad(midis, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    sig = np.zeros(n)
    for m in midis:
        for cents in (-7, 0, 7):
            f = hz(m) * 2 ** (cents / 1200)
            for h in range(1, 6):
                sig += np.sin(2 * np.pi * f * h * t + rng.uniform(0, 6)) / h**1.6
    sig *= env_adsr(n, 0.5, 0.9) * (0.85 + 0.15 * np.sin(2 * np.pi * 0.25 * t))
    return one_pole_lowpass(sig, 1800) / (len(midis) * 3)


def pluck(midi, dur=0.7):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = hz(midi)
    sig = sum(np.sin(2 * np.pi * f * h * t) * np.exp(-t * (5 + h * 4)) / h for h in range(1, 6))
    return sig * env_adsr(n, 0.003, 0.05)


def kick():
    n = int(0.42 * SR)
    t = np.arange(n) / SR
    f = 46 + 90 * np.exp(-t * 28)
    phase = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(phase) * np.exp(-t * 7.5) + 0.25 * np.sin(phase * 2) * np.exp(-t * 30)


def hat(decay=0.035):
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    noise = np.diff(rng.standard_normal(n + 1))
    return noise * np.exp(-t / decay) * 0.5


def clap():
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    noise = one_pole_lowpass(rng.standard_normal(n), 3500) - one_pole_lowpass(rng.standard_normal(n), 600) * 0.3
    bursts = sum(np.exp(-np.clip(t - d, 0, None) * 120) * (t >= d) for d in (0, 0.011, 0.022))
    return noise * (bursts * 0.5 + np.exp(-t * 18))


def bass(midi, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = hz(midi)
    sig = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)
    return sig * env_adsr(n, 0.008, 0.06) * np.exp(-t * 2)


def tick(freq):
    n = int(0.05 * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * freq * t) * np.exp(-t * 90)


def riser(dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    out = np.empty(n)
    acc, a = 0.0, 0.0
    for i in range(n):
        cutoff = 300 + 6000 * (i / n) ** 2
        a = np.exp(-2 * np.pi * cutoff / SR)
        acc = (1 - a) * noise[i] + a * acc
        out[i] = acc
    return out * (t / dur) ** 2


# --- sound effects ---------------------------------------------------------

def shutter():
    a = hat(0.012) * 3
    out = np.zeros(int(0.12 * SR))
    out[: len(a)] += a
    j = int(0.045 * SR)
    out[j : j + len(a)] += a[: len(out) - j] * 0.8
    return out


def whoosh(dur=0.45):
    n = int(dur * SR)
    t = np.arange(n) / SR
    shape = np.sin(np.pi * t / dur) ** 2
    return one_pole_lowpass(rng.standard_normal(n), 2200) * shape * 0.9


def blip(freq=1320):
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * freq * t) * np.exp(-t * 40)


def chime(notes=(88, 95)):
    n = int(1.0 * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k, m in enumerate(notes):
        d = int(k * 0.07 * SR)
        f = hz(m)
        out[d:] += (np.sin(2 * np.pi * f * t) + 0.2 * np.sin(2 * np.pi * f * 2.01 * t))[: n - d] * np.exp(-t * 5)[: n - d]
    return out * 0.5


# --- arrangement -----------------------------------------------------------

PROGRESSION = [
    ([55, 59, 62, 66, 69], 43),  # Gmaj9
    ([54, 57, 62, 66], 42),  # D/F#
    ([52, 55, 59, 62], 40),  # Em7
    ([57, 62, 64, 69], 45),  # Asus4
]
OUTRO = ([50, 54, 57, 61, 64], 38)  # Dmaj9


def build(length, cuts, events):
    """cuts: (build, groove, full, outro) start times in seconds."""
    tr = Track(length)
    t_build, t_groove, t_full, t_outro = cuts

    # The mess: a low cluster and a ticking clock that speeds up.
    tr.add(0, pad([38, 39, 45], t_build + 0.4) * env_adsr(int((t_build + 0.4) * SR), 0.05, 0.4), gain=0.5, send=0.4)
    t, step, k = 0.0, BEAT, 0
    while t < t_build - 0.01:
        tr.add(t, tick(1900 if k % 2 == 0 else 1500), gain=0.35, pan=0.3 if k % 2 else -0.3, send=0.15)
        t += step
        k += 1
        if t > t_build - BEAT * 2:
            step = BEAT / 4
        elif t > t_build - BEAT * 4:
            step = BEAT / 2
    tr.add(t_build - 1.0, riser(1.0), gain=0.35, send=0.5)

    # Chords, arpeggio, rhythm.
    bar = 0
    t = t_build
    while t < t_outro - 0.01:
        chord, root = PROGRESSION[bar % len(PROGRESSION)]
        length_bar = min(BAR, t_outro - t)
        tr.add(t, pad(chord, length_bar + 0.6), gain=0.75, send=0.45)
        tones = chord + [c + 12 for c in chord[1:3]]
        for i in range(8):
            ti = t + i * BEAT / 2
            if ti >= t_outro:
                break
            tr.add(ti, pluck(tones[(i * 3 + bar) % len(tones)] + 12), gain=0.32, pan=0.35 * np.sin(i), send=0.35)
        for b in range(4):
            tb = t + b * BEAT
            if tb >= t_outro:
                break
            if tb < t_groove - 0.01 and b == 0:
                tr.add(tb, kick(), gain=0.38, send=0.1)
            if tb >= t_groove - 0.01:
                if b in (0, 2) or tb >= t_full - 0.01:
                    tr.add(tb, kick(), gain=0.6 if b in (0, 2) else 0.38, send=0.05)
                tr.add(tb + BEAT / 2, hat(), gain=0.2, pan=0.25, send=0.1)
                tr.add(tb, bass(root, BEAT * 0.45), gain=0.5, send=0.05)
                tr.add(tb + BEAT / 2, bass(root + 12 if b == 3 else root, BEAT * 0.4), gain=0.35, send=0.05)
            if tb >= t_full - 0.01 and b in (1, 3):
                tr.add(tb, clap(), gain=0.26, send=0.3)
        t += BAR
        bar += 1

    # The end card: one resolved chord.
    remaining = length - t_outro
    chord, root = OUTRO
    tr.add(t_outro, kick(), gain=0.7, send=0.1)
    tr.add(t_outro, pad(chord, remaining), gain=0.7, send=0.6)
    tr.add(t_outro, bass(root, 2.0) * np.exp(-np.arange(int(2.0 * SR)) / SR), gain=0.6)
    for i, m in enumerate(chord + [chord[2] + 12, chord[4] + 12]):
        tr.add(t_outro + i * BEAT / 4, pluck(m + 12, 1.2), gain=0.2, pan=-0.4 + i * 0.12, send=0.6)

    for kind, frame in events:
        sec = frame / FPS
        if kind == "shutter":
            tr.add(sec, shutter(), gain=0.5, send=0.1)
        elif kind == "whoosh":
            tr.add(sec, whoosh(), gain=0.28, pan=-0.3, send=0.2)
        elif kind == "pop":
            tr.add(sec, blip(990), gain=0.3, send=0.25)
        elif kind == "blip":
            tr.add(sec, blip(), gain=0.25, send=0.3)
        elif kind == "tap":
            tr.add(sec, tick(2400), gain=0.4, send=0.1)
        elif kind == "chime":
            tr.add(sec, chime(), gain=0.35, send=0.45)

    out = tr.mix()
    fade = int(1.2 * SR)
    out[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 1.5
    return out


def write(path, audio):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    wav = path.replace(".m4a", ".wav")
    pcm = (np.clip(audio, -1, 1) * 32767).astype(np.int16)
    with wave.open(wav, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", wav, "-c:a", "aac", "-b:a", "192k", path], check=True)
    os.remove(wav)


# Event frames, from the scene files (30 s cut: hook 0, snap 90, email 330, accountant 540, end 750).
EVENTS_30 = [
    ("shutter", 90 + 28),
    ("blip", 90 + 104),
    ("blip", 90 + 132),
    ("tap", 90 + 186),
    *[("whoosh", 330 + a) for a in (18, 52, 86)],
    *[("pop", 330 + a + 28) for a in (18, 52, 86)],
    ("chime", 330 + 128),
    *[("tap", 540 + a) for a in (16, 32, 48)],
    ("whoosh", 540 + 104),
    ("tap", 540 + 160),
    ("chime", 540 + 164),
]

# 15 s cut: hook 0, snap 60 (×0.625), email 210 (×90/210), accountant 300 (short), end 360.
EVENTS_15 = [
    ("shutter", 60 + 18),
    ("blip", 60 + 65),
    ("blip", 60 + 83),
    ("tap", 60 + 116),
    *[("whoosh", 210 + a) for a in (8, 22, 37)],
    *[("pop", 210 + a + 12) for a in (8, 22, 37)],
    ("chime", 210 + 55),
    ("tap", 300 + 25),
    ("chime", 300 + 29),
]

if __name__ == "__main__":
    here = os.path.join(os.path.dirname(__file__), "..", "public", "audio")
    write(os.path.join(here, "Ad30.m4a"), build(30.0, (3.0, 11.0, 18.0, 25.0), EVENTS_30))
    write(os.path.join(here, "Ad15.m4a"), build(15.0, (2.0, 7.0, 10.0, 12.0), EVENTS_15))
    print("ok")
