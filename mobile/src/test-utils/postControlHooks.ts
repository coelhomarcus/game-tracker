/**
 * The post control hooks of `features/feed/queries` as idle mutations, for suites that mock that
 * module and render posts: `jest.mock('…/queries', () => ({ ...jest.requireActual<
 * typeof import('@/test-utils/postControlHooks')>('@/test-utils/postControlHooks').postControlHooks() }))`.
 */
export function postControlHooks() {
  const idle = () => ({ mutate: jest.fn() });
  return {
    useTogglePostLike: idle,
    useTogglePostRepost: idle,
    useTogglePostBookmark: idle,
    useDeletePost: idle,
  };
}
