import { relations, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const gameEntryStatusEnum = pgEnum('game_entry_status', ['backlog', 'playing', 'completed', 'dropped']);
export const postTypeEnum = pgEnum('post_type', ['status', 'review', 'activity']);
export const pushProviderEnum = pgEnum('push_provider', ['fcm']);
export const notificationTypeEnum = pgEnum('notification_type', [
  'like',
  'comment',
  'follow',
  'reply',
  'mention',
  'repost',
  'quote',
]);

export const DM_POLICIES = ['everyone', 'following', 'nobody'] as const;
export type DmPolicy = (typeof DM_POLICIES)[number];

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: varchar('username', { length: 30 }).notNull().unique(),
    name: varchar('name', { length: 256 }),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    avatarUrl: varchar('avatar_url', { length: 500 }),
    bannerUrl: varchar('banner_url', { length: 500 }),
    bio: varchar('bio', { length: 1024 }),
    /** Quem pode mandar mensagem direta: todos, só quem a pessoa segue, ou ninguém. */
    dmPolicy: varchar('dm_policy', { length: 16, enum: DM_POLICIES }).notNull().default('everyone'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // A busca de menções compara `lower(username)`; sem este índice ela varre a tabela.
    usernameLowerIdx: index('users_username_lower_idx').on(sql`lower(${table.username})`),
    dmPolicyCheck: check('users_dm_policy_check', sql`${table.dmPolicy} in ('everyone', 'following', 'nobody')`),
  }),
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 255 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('refresh_tokens_user_id_idx').on(table.userId),
  }),
);

/** Cache local dos jogos vindos da IGDB — populado sob demanda quando um usuário trackeia um jogo. */
export const games = pgTable('games', {
  id: uuid('id').primaryKey().defaultRandom(),
  igdbId: integer('igdb_id').notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  coverUrl: varchar('cover_url', { length: 500 }),
  summary: text('summary'),
  screenshots: text('screenshots').array().notNull().default([]),
  platforms: text('platforms').array().notNull(),
  genres: text('genres').array().notNull(),
  cachedAt: timestamp('cached_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Favoritar é sobre o JOGO, não um playthrough específico — não exige ter
 * trackeado nada (mesmo espírito de "filmes favoritos" do Letterboxd).
 */
export const favorites = pgTable(
  'favorites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userGameUnique: unique('favorites_user_id_game_id_unique').on(table.userId, table.gameId),
    userIdIdx: index('favorites_user_id_idx').on(table.userId),
  }),
);

/** Um registro por playthrough — sem unique(userId, gameId) para permitir replays. */
export const gameEntries = pgTable(
  'game_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'restrict' }),
    platform: varchar('platform', { length: 50 }).notNull(),
    status: gameEntryStatusEnum('status').notNull().default('backlog'),
    startedAt: date('started_at', { mode: 'date' }),
    finishedAt: date('finished_at', { mode: 'date' }),
    hoursPlayed: numeric('hours_played', { precision: 6, scale: 1 }),
    rating: smallint('rating'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('game_entries_user_id_idx').on(table.userId),
    gameIdIdx: index('game_entries_game_id_idx').on(table.gameId),
    // Usado pelas stats agregadas e pela lista de "quem está jogando" (filtro gameId + status).
    gameStatusIdx: index('game_entries_game_status_idx').on(table.gameId, table.status),
  }),
);

export const posts = pgTable(
  'posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: varchar('content', { length: 500 }).notNull(),
    gameEntryId: uuid('game_entry_id').references(() => gameEntries.id, { onDelete: 'set null' }),
    // Verdade única de "sobre qual jogo é este post": resolvida a partir do
    // gameEntryId quando existe (playthrough próprio), ou setada direto
    // quando o post é vinculado a um jogo que o autor nunca trackeou.
    gameId: uuid('game_id').references(() => games.id, { onDelete: 'set null' }),
    // Snapshot do status no momento em que a atividade aconteceu — imutável.
    // Sem isso, um post antigo ("começou a jogar") lia o status ATUAL do
    // playthrough (que pode já ter virado "completo"), porque gameEntry é a
    // mesma linha mutável compartilhada por todos os posts daquele entryId.
    activityStatus: gameEntryStatusEnum('activity_status'),
    type: postTypeEnum('type').notNull().default('status'),
    imageUrl: varchar('image_url', { length: 500 }),
    // Post citado (quote post). Se o original for apagado o quote continua, só perde a referência.
    quotedPostId: uuid('quoted_post_id').references((): AnyPgColumn => posts.id, { onDelete: 'set null' }),
    // Vira true quando o original citado é apagado (a FK zera quoted_post_id): sem isto a citação
    // órfã não se distingue de um post comum e o cliente não consegue mostrar "post removido".
    quotedPostRemoved: boolean('quoted_post_removed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('posts_user_id_idx').on(table.userId),
    quotedPostIdIdx: index('posts_quoted_post_id_idx').on(table.quotedPostId),
    // composto pra keyset pagination (order by created_at desc, id desc)
    createdAtIdx: index('posts_created_at_id_idx').on(table.createdAt, table.id),
    gameIdIdx: index('posts_game_id_idx').on(table.gameId),
  }),
);

/** Um repost por (post, usuário) — o repost não tem conteúdo próprio (quote post é um post novo). */
export const reposts = pgTable(
  'reposts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    postUserUnique: unique('reposts_post_id_user_id_unique').on(table.postId, table.userId),
    // composto pra keyset pagination (order by created_at desc, id desc)
    createdAtIdx: index('reposts_created_at_id_idx').on(table.createdAt, table.id),
    userIdIdx: index('reposts_user_id_idx').on(table.userId),
  }),
);

/** Posts salvos — privados: só o próprio usuário os enxerga. */
export const bookmarks = pgTable(
  'bookmarks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    postUserUnique: unique('bookmarks_post_id_user_id_unique').on(table.postId, table.userId),
    userCreatedIdx: index('bookmarks_user_id_created_at_idx').on(table.userId, table.createdAt),
  }),
);

/** Até 4 imagens por post, ordenadas por `position` (0–3). `posts.image_url` segue existindo por compatibilidade. */
export const postImages = pgTable(
  'post_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    url: varchar('url', { length: 500 }).notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    position: smallint('position').notNull(),
    alt: varchar('alt', { length: 1000 }),
  },
  (table) => ({
    postPositionUnique: unique('post_images_post_id_position_unique').on(table.postId, table.position),
    positionRange: check('post_images_position_range', sql`${table.position} between 0 and 3`),
  }),
);

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parentCommentId: uuid('parent_comment_id').references((): AnyPgColumn => comments.id, { onDelete: 'cascade' }),
    content: varchar('content', { length: 500 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    postIdIdx: index('comments_post_id_idx').on(table.postId),
    parentCommentIdIdx: index('comments_parent_comment_id_idx').on(table.parentCommentId),
  }),
);

/** Um like por (post, usuário) — unique constraint evita curtir duas vezes. */
export const likes = pgTable(
  'likes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    postUserUnique: unique('likes_post_id_user_id_unique').on(table.postId, table.userId),
  }),
);

/** Um like por (comentário, usuário) — mesmo padrão de `likes`, mas pra comentários. */
export const commentLikes = pgTable(
  'comment_likes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    commentId: uuid('comment_id')
      .notNull()
      .references(() => comments.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    commentUserUnique: unique('comment_likes_comment_id_user_id_unique').on(table.commentId, table.userId),
  }),
);

export const follows = pgTable(
  'follows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    followerId: uuid('follower_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    followingId: uuid('following_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    followerFollowingUnique: unique('follows_follower_id_following_id_unique').on(table.followerId, table.followingId),
  }),
);

/**
 * Silenciar é de um lado só e discreto: quem silencia deixa de ver os posts e reposts da pessoa nos
 * feeds e de receber as notificações dela; a pessoa silenciada não percebe nada.
 */
export const mutes = pgTable(
  'mutes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    muterId: uuid('muter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mutedId: uuid('muted_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    muterMutedUnique: unique('mutes_muter_id_muted_id_unique').on(table.muterId, table.mutedId),
    mutedIdIdx: index('mutes_muted_id_idx').on(table.mutedId),
  }),
);

/**
 * Bloquear vale para os dois lados no conteúdo: nenhum dos dois vê os posts, reposts e comentários
 * do outro, e os follows entre eles são desfeitos (e recusados enquanto o bloqueio durar).
 */
export const blocks = pgTable(
  'blocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    blockerId: uuid('blocker_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blockedId: uuid('blocked_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    blockerBlockedUnique: unique('blocks_blocker_id_blocked_id_unique').on(table.blockerId, table.blockedId),
    blockedIdIdx: index('blocks_blocked_id_idx').on(table.blockedId),
  }),
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum('type').notNull(),
    postId: uuid('post_id').references(() => posts.id, { onDelete: 'cascade' }),
    // Preenchido nas notificações de reply/mention que nascem de um comentário.
    commentId: uuid('comment_id').references(() => comments.id, { onDelete: 'cascade' }),
    read: boolean('read').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('notifications_user_id_idx').on(table.userId),
  }),
);

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const conversationParticipants = pgTable(
  'conversation_participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    /** Conversa silenciada por este participante: sem push para ele. */
    muted: boolean('muted').notNull().default(false),
    /**
     * Quando este participante saiu da conversa (apagou para si). Ele só vê as mensagens
     * posteriores, e a conversa some da lista dele até chegar uma nova.
     */
    clearedAt: timestamp('cleared_at', { withTimezone: true }),
  },
  (table) => ({
    conversationUserUnique: unique('conversation_participants_conversation_id_user_id_unique').on(
      table.conversationId,
      table.userId,
    ),
    userIdIdx: index('conversation_participants_user_id_idx').on(table.userId),
  }),
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: varchar('content', { length: 2000 }).notNull(),
    /**
     * Id gerado pelo cliente para tornar o envio idempotente: repetir o mesmo envio (ex.: o ACK
     * se perdeu) devolve a mensagem já gravada em vez de criar outra. Nulo nas mensagens do
     * cliente legado, que não envia o campo.
     */
    clientMessageId: uuid('client_message_id'),
    /**
     * A mensagem anterior, da mesma conversa, a que esta responde. Vira nulo se a original for
     * apagada de vez (a resposta continua).
     */
    replyToId: uuid('reply_to_id').references((): AnyPgColumn => messages.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // composto pra keyset pagination (order by created_at desc, id desc)
    conversationCreatedIdx: index('messages_conversation_id_created_at_id_idx').on(
      table.conversationId,
      table.createdAt,
      table.id,
    ),
    // Parcial: só vale quando o cliente informa o id (as mensagens legadas têm NULL).
    clientMessageUnique: uniqueIndex('messages_conversation_sender_client_message_unique')
      .on(table.conversationId, table.senderId, table.clientMessageId)
      .where(sql`${table.clientMessageId} is not null`),
    // Apagar uma mensagem procura as respostas a ela (on delete set null): sem o índice, cada
    // exclusão (também em cascata, ao apagar uma conta) varreria a tabela. Parcial: só respostas.
    replyToIdx: index('messages_reply_to_id_idx')
      .on(table.replyToId)
      .where(sql`${table.replyToId} is not null`),
  }),
);

/** Mensagens que um participante apagou só para si. O outro continua vendo. */
export const messageHides = pgTable(
  'message_hides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    messageUserUnique: unique('message_hides_message_id_user_id_unique').on(table.messageId, table.userId),
    // Apagar a conta remove as linhas pelo user_id; sem o índice cada exclusão varre a tabela.
    userIdIdx: index('message_hides_user_id_idx').on(table.userId),
  }),
);

/** Reações a mensagens: um emoji por linha; cada pessoa usa no máximo 5 emojis distintos por mensagem. */
export const messageReactions = pgTable(
  'message_reactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emoji: varchar('emoji', { length: 16 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    messageUserEmojiUnique: unique('message_reactions_message_id_user_id_emoji_unique').on(
      table.messageId,
      table.userId,
      table.emoji,
    ),
    userIdIdx: index('message_reactions_user_id_idx').on(table.userId),
  }),
);

/**
 * Uma linha por instalação do app (id gerado no aparelho). O token pertence à instalação, não ao
 * usuário: ao trocar de conta no mesmo aparelho a instalação passa para o novo dono, então a conta
 * anterior para de receber push ali.
 */
export const pushInstallations = pgTable(
  'push_installations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    installationId: uuid('installation_id').notNull().unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: pushProviderEnum('provider').notNull(),
    platform: varchar('platform', { length: 20 }).notNull(),
    // Tokens FCM passam de 255 caracteres; o limite antigo não serve.
    token: text('token').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('push_installations_user_id_idx').on(table.userId),
    // Um token só pode estar em uma instalação por provider.
    providerTokenUnique: unique('push_installations_provider_token_unique').on(table.provider, table.token),
  }),
);

// ---------- relations ----------

export const usersRelations = relations(users, ({ many }) => ({
  refreshTokens: many(refreshTokens),
  gameEntries: many(gameEntries),
  posts: many(posts),
  comments: many(comments),
  likes: many(likes),
  reposts: many(reposts),
  bookmarks: many(bookmarks),
  following: many(follows, { relationName: 'follower' }),
  followers: many(follows, { relationName: 'following' }),
  notificationsReceived: many(notifications, { relationName: 'notificationRecipient' }),
  notificationsCaused: many(notifications, { relationName: 'notificationActor' }),
  conversationParticipants: many(conversationParticipants),
  messages: many(messages),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}));

export const gamesRelations = relations(games, ({ many }) => ({
  gameEntries: many(gameEntries),
  favorites: many(favorites),
}));

export const favoritesRelations = relations(favorites, ({ one }) => ({
  user: one(users, { fields: [favorites.userId], references: [users.id] }),
  game: one(games, { fields: [favorites.gameId], references: [games.id] }),
}));

export const gameEntriesRelations = relations(gameEntries, ({ one, many }) => ({
  user: one(users, { fields: [gameEntries.userId], references: [users.id] }),
  game: one(games, { fields: [gameEntries.gameId], references: [games.id] }),
  posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  user: one(users, { fields: [posts.userId], references: [users.id] }),
  gameEntry: one(gameEntries, { fields: [posts.gameEntryId], references: [gameEntries.id] }),
  game: one(games, { fields: [posts.gameId], references: [games.id] }),
  quotedPost: one(posts, {
    fields: [posts.quotedPostId],
    references: [posts.id],
    relationName: 'postQuotes',
  }),
  quotes: many(posts, { relationName: 'postQuotes' }),
  comments: many(comments),
  likes: many(likes),
  reposts: many(reposts),
  bookmarks: many(bookmarks),
  images: many(postImages),
  notifications: many(notifications),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  post: one(posts, { fields: [comments.postId], references: [posts.id] }),
  user: one(users, { fields: [comments.userId], references: [users.id] }),
  parentComment: one(comments, {
    fields: [comments.parentCommentId],
    references: [comments.id],
    relationName: 'commentReplies',
  }),
  replies: many(comments, { relationName: 'commentReplies' }),
  likes: many(commentLikes),
  notifications: many(notifications),
}));

export const likesRelations = relations(likes, ({ one }) => ({
  post: one(posts, { fields: [likes.postId], references: [posts.id] }),
  user: one(users, { fields: [likes.userId], references: [users.id] }),
}));

export const repostsRelations = relations(reposts, ({ one }) => ({
  post: one(posts, { fields: [reposts.postId], references: [posts.id] }),
  user: one(users, { fields: [reposts.userId], references: [users.id] }),
}));

export const bookmarksRelations = relations(bookmarks, ({ one }) => ({
  post: one(posts, { fields: [bookmarks.postId], references: [posts.id] }),
  user: one(users, { fields: [bookmarks.userId], references: [users.id] }),
}));

export const postImagesRelations = relations(postImages, ({ one }) => ({
  post: one(posts, { fields: [postImages.postId], references: [posts.id] }),
}));

export const commentLikesRelations = relations(commentLikes, ({ one }) => ({
  comment: one(comments, { fields: [commentLikes.commentId], references: [comments.id] }),
  user: one(users, { fields: [commentLikes.userId], references: [users.id] }),
}));

export const followsRelations = relations(follows, ({ one }) => ({
  follower: one(users, { fields: [follows.followerId], references: [users.id], relationName: 'follower' }),
  following: one(users, { fields: [follows.followingId], references: [users.id], relationName: 'following' }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
    relationName: 'notificationRecipient',
  }),
  actor: one(users, {
    fields: [notifications.actorId],
    references: [users.id],
    relationName: 'notificationActor',
  }),
  post: one(posts, { fields: [notifications.postId], references: [posts.id] }),
  comment: one(comments, { fields: [notifications.commentId], references: [comments.id] }),
}));

export const conversationsRelations = relations(conversations, ({ many }) => ({
  participants: many(conversationParticipants),
  messages: many(messages),
}));

export const conversationParticipantsRelations = relations(conversationParticipants, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationParticipants.conversationId],
    references: [conversations.id],
  }),
  user: one(users, { fields: [conversationParticipants.userId], references: [users.id] }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, { fields: [messages.conversationId], references: [conversations.id] }),
  sender: one(users, { fields: [messages.senderId], references: [users.id] }),
}));
