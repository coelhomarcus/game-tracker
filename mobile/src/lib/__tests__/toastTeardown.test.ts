import { useToast, showToast } from '@/lib/toast';

// A toast arms a 3 s timer that would keep a jest worker alive after its last test, so the
// global teardown in jest.setup.ts hides it. The second test only sees the effect of the first.
describe('toast teardown', () => {
  it('arms a toast', () => {
    showToast('olá');

    expect(useToast.getState().message).toBe('olá');
  });

  it('starts the next test without a toast', () => {
    expect(useToast.getState().message).toBeNull();
  });
});
