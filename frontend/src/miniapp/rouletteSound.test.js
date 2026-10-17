import { createRouletteSound, readRouletteSoundEnabled, saveRouletteSoundEnabled } from './rouletteSound';

let context;
let oscillators;
let gains;
const param = () => ({ setValueAtTime: jest.fn(), linearRampToValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() });

beforeEach(() => {
  localStorage.clear();
  oscillators = []; gains = [];
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  context = {
    state: 'running', currentTime: 10, destination: {},
    resume: jest.fn().mockResolvedValue(), close: jest.fn().mockResolvedValue(),
    createOscillator: jest.fn(() => {
      const oscillator = { frequency: param(), connect: jest.fn(), disconnect: jest.fn(), start: jest.fn(), stop: jest.fn() };
      oscillators.push(oscillator); return oscillator;
    }),
    createGain: jest.fn(() => {
      const gain = { gain: param(), connect: jest.fn(), disconnect: jest.fn() };
      gains.push(gain); return gain;
    }),
  };
  window.AudioContext = jest.fn(() => context);
  delete window.webkitAudioContext;
});

afterEach(() => { delete window.AudioContext; delete window.webkitAudioContext; jest.restoreAllMocks(); });

test('opening and calling unprepared sounds never creates an audio context', () => {
  const sound = createRouletteSound();
  sound.tick(); sound.result();
  expect(window.AudioContext).not.toHaveBeenCalled();
  sound.prepare();
  expect(window.AudioContext).toHaveBeenCalledTimes(1);
  expect(context.createOscillator).not.toHaveBeenCalled();
  sound.dispose();
});

test('tick is a quiet 22ms envelope and disconnects after ending', () => {
  const sound = createRouletteSound(); sound.prepare(); sound.tick();
  expect(oscillators[0].type).toBe('triangle');
  expect(oscillators[0].start).toHaveBeenCalledWith(10);
  expect(oscillators[0].stop).toHaveBeenCalledWith(10.032);
  expect(gains[0].gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.025, 10.003);
  expect(gains[0].gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0001, 10.022);
  oscillators[0].onended();
  expect(gains[0].disconnect).toHaveBeenCalledTimes(1);
  sound.dispose();
  expect(oscillators[0].stop).toHaveBeenCalledTimes(1);
});

test('result stops ticks and plays two soft, short notes', () => {
  const sound = createRouletteSound(); sound.prepare(); sound.tick(); sound.result();
  expect(oscillators).toHaveLength(3);
  expect(oscillators[0].stop).toHaveBeenLastCalledWith();
  expect(oscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(660, 10);
  expect(oscillators[2].frequency.setValueAtTime).toHaveBeenCalledWith(880, 10.09);
  expect(gains[2].gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.035, 10.093);
  sound.dispose();
});

test('muting immediately cancels voices and prevents ticks, result, and context creation', () => {
  const muted = createRouletteSound(false); muted.prepare(); muted.tick(); muted.result();
  expect(window.AudioContext).not.toHaveBeenCalled();
  const sound = createRouletteSound(); sound.prepare(); sound.tick();
  sound.setEnabled(false); sound.tick(); sound.result();
  expect(oscillators).toHaveLength(1);
  expect(oscillators[0].stop).toHaveBeenLastCalledWith();
  sound.setEnabled(true); sound.prepare(); sound.tick();
  expect(oscillators).toHaveLength(2);
  expect(window.AudioContext).toHaveBeenCalledTimes(1);
  sound.dispose();
});

test('hidden or suspended WebViews stay silent without queued sounds', async () => {
  const sound = createRouletteSound(); sound.prepare();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  sound.prepare(); sound.tick(); sound.result();
  expect(oscillators).toHaveLength(0);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  context.state = 'suspended';
  context.resume.mockRejectedValue(new Error('Blocked'));
  sound.prepare(); sound.tick(); sound.result();
  await Promise.resolve();
  expect(context.resume).toHaveBeenCalledTimes(1);
  expect(oscillators).toHaveLength(0);
  sound.dispose();
});

test('legacy Safari context and interrupted context can be prepared by a click', () => {
  window.webkitAudioContext = window.AudioContext; delete window.AudioContext;
  context.state = 'interrupted';
  const sound = createRouletteSound(); sound.prepare();
  expect(window.webkitAudioContext).toHaveBeenCalledTimes(1);
  expect(context.resume).toHaveBeenCalledTimes(1);
  sound.dispose();
});

test('unsupported or throwing audio never breaks an action', () => {
  delete window.AudioContext;
  const unsupported = createRouletteSound();
  expect(() => { unsupported.prepare(); unsupported.tick(); unsupported.result(); unsupported.dispose(); }).not.toThrow();
  window.AudioContext = jest.fn(() => { throw new Error('Unavailable'); });
  expect(() => unsupported.prepare()).not.toThrow();
  window.AudioContext = jest.fn(() => context);
  const sound = createRouletteSound(); sound.prepare();
  context.createGain.mockImplementation(() => { throw new Error('Device disconnected'); });
  expect(() => { sound.tick(); sound.result(); }).not.toThrow();
  context.close.mockRejectedValue(new Error('Already closing'));
  expect(() => sound.dispose()).not.toThrow();
});

test('dispose closes audio and allows a clean later mount without autoplay', () => {
  const sound = createRouletteSound(); sound.prepare(); sound.tick(); sound.dispose();
  expect(context.close).toHaveBeenCalledTimes(1);
  expect(gains[0].disconnect).toHaveBeenCalled();
  sound.tick(); sound.result();
  expect(oscillators).toHaveLength(1);
  sound.prepare(); sound.tick();
  expect(window.AudioContext).toHaveBeenCalledTimes(2);
  expect(oscillators).toHaveLength(2);
  sound.dispose();
});

test('sound preference is saved and storage failures are harmless', () => {
  expect(readRouletteSoundEnabled()).toBe(true);
  saveRouletteSoundEnabled(false);
  expect(readRouletteSoundEnabled()).toBe(false);
  saveRouletteSoundEnabled(true);
  expect(readRouletteSoundEnabled()).toBe(true);
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage denied'); });
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage denied'); });
  expect(readRouletteSoundEnabled()).toBe(true);
  expect(() => saveRouletteSoundEnabled(false)).not.toThrow();
});
