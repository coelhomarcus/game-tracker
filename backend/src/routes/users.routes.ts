import { Router } from 'express';
import {
  followHandler,
  getFollowersHandler,
  getFollowingHandler,
  getMyLikesHandler,
  getPublicProfileHandler,
  getMyBookmarksHandler,
  getUserCommentsHandler,
  getUserFavoritesHandler,
  getUserGameEntriesHandler,
  getUserPostsHandler,
  searchHandler,
  unfollowHandler,
  updateProfileHandler,
  uploadAvatarHandler,
  uploadBannerHandler,
} from '../controllers/users.controller';
import { requireAuth } from '../middlewares/auth';
import { validateBody, validateQuery } from '../middlewares/validate';
import { avatarUpload, bannerUpload } from '../lib/uploads';
import { bookmarksQuerySchema } from '../schemas/posts.schema';
import { listGameEntriesQuerySchema } from '../schemas/gameEntry.schema';
import {
  followListQuerySchema,
  searchUsersQuerySchema,
  updateProfileSchema,
  userPostsQuerySchema,
} from '../schemas/users.schema';

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.patch('/me', validateBody(updateProfileSchema), updateProfileHandler);
usersRouter.post('/me/avatar', avatarUpload.single('avatar'), uploadAvatarHandler);
usersRouter.post('/me/banner', bannerUpload.single('banner'), uploadBannerHandler);
usersRouter.get('/me/bookmarks', validateQuery(bookmarksQuerySchema), getMyBookmarksHandler);
usersRouter.get('/me/likes', validateQuery(bookmarksQuerySchema), getMyLikesHandler);
usersRouter.get('/search', validateQuery(searchUsersQuerySchema), searchHandler);
usersRouter.get('/:id', getPublicProfileHandler);
usersRouter.get('/:id/posts', validateQuery(userPostsQuerySchema), getUserPostsHandler);
usersRouter.get('/:id/followers', validateQuery(followListQuerySchema), getFollowersHandler);
usersRouter.get('/:id/following', validateQuery(followListQuerySchema), getFollowingHandler);
usersRouter.get('/:id/comments', validateQuery(userPostsQuerySchema), getUserCommentsHandler);
usersRouter.get('/:id/game-entries', validateQuery(listGameEntriesQuerySchema), getUserGameEntriesHandler);
usersRouter.get('/:id/favorites', getUserFavoritesHandler);
usersRouter.post('/:id/follow', followHandler);
usersRouter.delete('/:id/follow', unfollowHandler);
