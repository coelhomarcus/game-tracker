import { Router } from 'express';
import {
  blockHandler,
  deleteAccountHandler,
  followHandler,
  getFollowersHandler,
  getFollowingHandler,
  getMyBlocksHandler,
  getMyLikesHandler,
  getMyMutesHandler,
  getPublicProfileHandler,
  getMyBookmarksHandler,
  getUserCommentsHandler,
  getUserFavoritesHandler,
  getUserGameEntriesHandler,
  getUserPostsHandler,
  muteHandler,
  removeAvatarHandler,
  removeBannerHandler,
  searchHandler,
  suggestionsHandler,
  unblockHandler,
  unfollowHandler,
  unmuteHandler,
  updateProfileHandler,
  uploadAvatarHandler,
  uploadBannerHandler,
} from '../controllers/users.controller';
import { requireAuth } from '../middlewares/auth';
import { authLimiter } from '../middlewares/authLimiter';
import { validateBody, validateQuery } from '../middlewares/validate';
import { avatarUpload, bannerUpload } from '../lib/uploads';
import { deleteAccountSchema } from '../schemas/auth.schema';
import { bookmarksQuerySchema } from '../schemas/posts.schema';
import { listGameEntriesQuerySchema } from '../schemas/gameEntry.schema';
import {
  followListQuerySchema,
  searchUsersQuerySchema,
  suggestionsQuerySchema,
  updateProfileSchema,
  userPostsQuerySchema,
} from '../schemas/users.schema';

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.patch('/me', validateBody(updateProfileSchema), updateProfileHandler);
usersRouter.delete('/me', authLimiter, validateBody(deleteAccountSchema), deleteAccountHandler);
usersRouter.post('/me/avatar', avatarUpload.single('avatar'), uploadAvatarHandler);
usersRouter.post('/me/banner', bannerUpload.single('banner'), uploadBannerHandler);
usersRouter.delete('/me/avatar', removeAvatarHandler);
usersRouter.delete('/me/banner', removeBannerHandler);
usersRouter.get('/me/bookmarks', validateQuery(bookmarksQuerySchema), getMyBookmarksHandler);
usersRouter.get('/me/likes', validateQuery(bookmarksQuerySchema), getMyLikesHandler);
usersRouter.get('/me/mutes', validateQuery(followListQuerySchema), getMyMutesHandler);
usersRouter.get('/me/blocks', validateQuery(followListQuerySchema), getMyBlocksHandler);
usersRouter.get('/search', validateQuery(searchUsersQuerySchema), searchHandler);
// Antes de `/:id`, senão "suggestions" seria lido como um id.
usersRouter.get('/suggestions', validateQuery(suggestionsQuerySchema), suggestionsHandler);
usersRouter.get('/:id', getPublicProfileHandler);
usersRouter.get('/:id/posts', validateQuery(userPostsQuerySchema), getUserPostsHandler);
usersRouter.get('/:id/followers', validateQuery(followListQuerySchema), getFollowersHandler);
usersRouter.get('/:id/following', validateQuery(followListQuerySchema), getFollowingHandler);
usersRouter.get('/:id/comments', validateQuery(userPostsQuerySchema), getUserCommentsHandler);
usersRouter.get('/:id/game-entries', validateQuery(listGameEntriesQuerySchema), getUserGameEntriesHandler);
usersRouter.get('/:id/favorites', getUserFavoritesHandler);
usersRouter.post('/:id/follow', followHandler);
usersRouter.delete('/:id/follow', unfollowHandler);
usersRouter.post('/:id/mute', muteHandler);
usersRouter.delete('/:id/mute', unmuteHandler);
usersRouter.post('/:id/block', blockHandler);
usersRouter.delete('/:id/block', unblockHandler);
