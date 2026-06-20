export class StoryText {
  constructor(elA, elB, beats) {
    this.beats = beats;
    this.outEl = elA;
    this.inEl = elB;
    this.outBeat = -1;
    this.inBeat = -1;
    this.settledBeat = -1;
    this.showSettled(0);
  }

  applyBeat(el, index) {
    const beat = this.beats[index];
    if (!beat) return;
    el.innerHTML = beat.html;
    el.className = `story-text story-text--${beat.style}`;
  }

  ensureBeat(el, key, index) {
    if (this[key] === index) return index;
    this.applyBeat(el, index);
    this[key] = index;
    return index;
  }

  setOpacity(el, value) {
    el.style.opacity = String(value);
  }

  showSettled(beat) {
    this.ensureBeat(this.outEl, "outBeat", beat);
    this.setOpacity(this.outEl, 1);
    this.setOpacity(this.inEl, 0);
    this.inBeat = -1;
    this.settledBeat = beat;
  }

  setBeatState(fromIndex, progress) {
    const from = Math.max(0, Math.min(this.beats.length - 1, fromIndex));
    const to = Math.min(this.beats.length - 1, from + 1);
    const t = Math.max(0, Math.min(1, progress));

    if (from >= this.beats.length - 1 || t < 0.001) {
      this.showSettled(from);
      return;
    }

    this.ensureBeat(this.outEl, "outBeat", from);
    this.ensureBeat(this.inEl, "inBeat", to);
    this.setOpacity(this.outEl, 1 - t);
    this.setOpacity(this.inEl, t);

    if (t > 0.999 && this.settledBeat !== to) {
      const prevOut = this.outEl;
      this.outEl = this.inEl;
      this.inEl = prevOut;
      this.outBeat = this.inBeat;
      this.inBeat = -1;
      this.setOpacity(this.outEl, 1);
      this.setOpacity(this.inEl, 0);
      this.settledBeat = to;
    }
  }
}
