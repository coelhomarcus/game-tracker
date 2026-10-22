import { dragProgress, idleProgress, snapProgress } from '../useHideOnScroll';

const HEADER = 100;

describe('dragProgress', () => {
  it('follows a downward drag, one header height for a full hide', () => {
    expect(dragProgress(0, 500, 525, HEADER)).toBeCloseTo(0.25);
    expect(dragProgress(0, 500, 600, HEADER)).toBe(1);
  });

  it('follows an upward drag back towards shown', () => {
    expect(dragProgress(1, 800, 750, HEADER)).toBeCloseTo(0.5);
    expect(dragProgress(1, 800, 700, HEADER)).toBe(0);
  });

  it('starts from where the header was when the drag began', () => {
    expect(dragProgress(0.4, 500, 520, HEADER)).toBeCloseTo(0.6);
    expect(dragProgress(0.4, 500, 480, HEADER)).toBeCloseTo(0.2);
  });

  it('stays between shown and hidden', () => {
    expect(dragProgress(0, 500, 900, HEADER)).toBe(1);
    expect(dragProgress(0.5, 500, 0, HEADER)).toBe(0);
    expect(dragProgress(1, 500, 2000, HEADER)).toBe(1);
  });

  it('never hides a header that has not been measured', () => {
    expect(dragProgress(0, 500, 900, 0)).toBe(0);
  });
});

describe('snapProgress', () => {
  it('hides after a downward drag', () => {
    expect(snapProgress(500, 520, HEADER, 0.2)).toBe(1);
  });

  it('shows after an upward drag', () => {
    expect(snapProgress(800, 780, HEADER, 0.8)).toBe(0);
  });

  it('settles on the closest state when the list did not move', () => {
    expect(snapProgress(500, 500, HEADER, 0.6)).toBe(1);
    expect(snapProgress(500, 500, HEADER, 0.4)).toBe(0);
  });

  it('always shows the header near the top', () => {
    expect(snapProgress(20, 99, HEADER, 0.9)).toBe(0);
  });
});

describe('idleProgress', () => {
  it('shows the header near the top even without a drag', () => {
    expect(idleProgress(50, HEADER, 1)).toBe(0);
  });

  it('leaves the header alone further down', () => {
    expect(idleProgress(400, HEADER, 1)).toBe(1);
    expect(idleProgress(400, HEADER, 0)).toBe(0);
  });
});
