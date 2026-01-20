import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "path";
import fs from "fs";
import {
  getStore,
  loadStore,
  nextId,
  saveStore,
  type User,
  type VerificationCode
} from "./store";
import { sendVerification } from "./notify";

const app = express();
const port = Number(process.env.PORT || 4000);
const jwtSecret = process.env.JWT_SECRET || "dev_secret_change_me";

loadStore();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

type AuthRequest = express.Request & { userId?: number };

const authMiddleware: express.RequestHandler = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header) {
    return res.status(401).json({ error: "Missing auth header" });
  }
  const token = header.replace("Bearer ", "");
  try {
    const payload = jwt.verify(token, jwtSecret) as { userId: number };
    (req as AuthRequest).userId = payload.userId;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
};

const buildToken = (userId: number) =>
  jwt.sign({ userId }, jwtSecret, { expiresIn: "7d" });

const toUserPublic = (user: User) => ({
  id: user.id,
  email: user.email,
  username: user.username,
  firstName: user.firstName,
  lastName: user.lastName,
  birthDate: user.birthDate,
  phone: user.phone,
  avatarUrl: user.avatarUrl,
  bio: user.bio,
  createdAt: user.createdAt
});

const nowIso = () => new Date().toISOString();

const generateCode = () => String(Math.floor(100000 + Math.random() * 900000));

const createVerificationCode = (
  userId: number,
  channel: "email" | "sms",
  code: string
) => {
  const store = getStore();
  const codeHash = bcrypt.hashSync(code, 10);
  const entry: VerificationCode = {
    id: nextId("verificationCodes"),
    userId,
    channel,
    codeHash,
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
  };
  store.verificationCodes = store.verificationCodes.filter(
    (item) => item.userId !== userId || item.channel !== channel
  );
  store.verificationCodes.push(entry);
  saveStore();
  return entry;
};

app.post("/api/auth/register", (req, res) => {
  const {
    email,
    username,
    password,
    firstName,
    lastName,
    birthDate,
    phone,
    address,
    consent,
    preferredChannel
  } = req.body || {};
  if (!email || !username || !password) {
    return res.status(400).json({ error: "Email, username, password requis" });
  }
  if (!consent) {
    return res.status(400).json({ error: "Consentement requis" });
  }
  if (preferredChannel === "sms" && !phone) {
    return res.status(400).json({ error: "Telephone requis pour SMS" });
  }
  const store = getStore();
  const existing = store.users.find(
    (user) => user.email === email || user.username === username
  );
  if (existing) {
    return res.status(409).json({ error: "Utilisateur deja existant" });
  }
  const user: User = {
    id: nextId("users"),
    email,
    username,
    passwordHash: bcrypt.hashSync(password, 10),
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    birthDate: birthDate || undefined,
    phone: phone || undefined,
    address: address || undefined,
    consentAt: nowIso(),
    privacyVersion: "1.0",
    preferredChannel: preferredChannel === "sms" ? "sms" : "email",
    emailVerified: false,
    phoneVerified: false,
    createdAt: nowIso()
  };
  store.users.push(user);
  saveStore();

  const channel = user.preferredChannel || "email";
  const code = generateCode();
  createVerificationCode(user.id, channel, code);
  const target = channel === "email" ? user.email : user.phone || "";
  sendVerification(channel, target, code).catch(() => null);

  return res.json({
    status: "verification_required",
    userId: user.id,
    channel
  });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email et mot de passe requis" });
  }
  const store = getStore();
  const user = store.users.find((u) => u.email === email);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: "Identifiants invalides" });
  }
  const preferred = user.preferredChannel || "email";
  const verified =
    preferred === "email" ? user.emailVerified : user.phoneVerified;
  if (!verified) {
    return res.status(403).json({
      error: "Verification requise",
      userId: user.id,
      channel: preferred
    });
  }
  const token = buildToken(user.id);
  return res.json({ token, user: toUserPublic(user) });
});

app.post("/api/auth/request-code", (req, res) => {
  const { userId, channel } = req.body || {};
  if (!userId || !channel) {
    return res.status(400).json({ error: "Parametres invalides" });
  }
  const store = getStore();
  const user = store.users.find((u) => u.id === Number(userId));
  if (!user) {
    return res.status(404).json({ error: "Utilisateur introuvable" });
  }
  const chosen = channel === "sms" ? "sms" : "email";
  if (chosen === "sms" && !user.phone) {
    return res.status(400).json({ error: "Telephone requis pour SMS" });
  }
  const code = generateCode();
  createVerificationCode(user.id, chosen, code);
  const target = chosen === "email" ? user.email : user.phone || "";
  sendVerification(chosen, target, code).catch(() => null);
  return res.json({ ok: true });
});

app.post("/api/auth/verify", (req, res) => {
  const { userId, channel, code } = req.body || {};
  if (!userId || !channel || !code) {
    return res.status(400).json({ error: "Parametres invalides" });
  }
  const store = getStore();
  const user = store.users.find((u) => u.id === Number(userId));
  if (!user) {
    return res.status(404).json({ error: "Utilisateur introuvable" });
  }
  const chosen = channel === "sms" ? "sms" : "email";
  const entry = store.verificationCodes.find(
    (item) => item.userId === user.id && item.channel === chosen
  );
  if (!entry) {
    return res.status(400).json({ error: "Code introuvable" });
  }
  if (new Date(entry.expiresAt).getTime() < Date.now()) {
    return res.status(400).json({ error: "Code expire" });
  }
  const ok = bcrypt.compareSync(String(code), entry.codeHash);
  if (!ok) {
    return res.status(400).json({ error: "Code invalide" });
  }
  if (chosen === "email") {
    user.emailVerified = true;
  } else {
    user.phoneVerified = true;
  }
  store.verificationCodes = store.verificationCodes.filter(
    (item) => item.id !== entry.id
  );
  saveStore();
  return res.json({ ok: true });
});

app.get("/api/me", authMiddleware, (req, res) => {
  const userId = (req as AuthRequest).userId!;
  const store = getStore();
  const user = store.users.find((u) => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: "Utilisateur introuvable" });
  }
  const followers = store.follows.filter((f) => f.followingId === userId).length;
  const following = store.follows.filter((f) => f.followerId === userId).length;
  const posts = store.posts.filter((p) => p.userId === userId).length;
  return res.json({
    user: toUserPublic(user),
    stats: { followers, following, posts }
  });
});

app.put("/api/me", authMiddleware, (req, res) => {
  const userId = (req as AuthRequest).userId!;
  const { avatarUrl, bio, username } = req.body || {};
  const store = getStore();
  const user = store.users.find((u) => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: "Utilisateur introuvable" });
  }
  if (username && username !== user.username) {
    const taken = store.users.some(
      (u) => u.username === username && u.id !== userId
    );
    if (taken) {
      return res.status(409).json({ error: "Nom utilisateur deja pris" });
    }
    user.username = String(username).trim();
  }
  if (avatarUrl !== undefined) {
    user.avatarUrl = String(avatarUrl).trim() || undefined;
  }
  if (bio !== undefined) {
    user.bio = String(bio).trim() || undefined;
  }
  saveStore();
  return res.json({ user: toUserPublic(user) });
});

app.get("/api/users/search", authMiddleware, (req, res) => {
  const query = String(req.query.q || "").trim().toLowerCase();
  if (!query) {
    return res.json({ users: [] });
  }
  const userId = (req as AuthRequest).userId!;
  const store = getStore();
  const users = store.users
    .filter((user) => user.username.toLowerCase().includes(query))
    .slice(0, 10)
    .map((user) => ({
      ...toUserPublic(user),
      isFollowing: store.follows.some(
        (follow) => follow.followerId === userId && follow.followingId === user.id
      )
    }));
  return res.json({ users });
});

app.get("/api/users/:id", authMiddleware, (req, res) => {
  const targetId = Number(req.params.id);
  const userId = (req as AuthRequest).userId!;
  const store = getStore();
  const user = store.users.find((u) => u.id === targetId);
  if (!user) {
    return res.status(404).json({ error: "Utilisateur introuvable" });
  }
  const followers = store.follows.filter((f) => f.followingId === targetId).length;
  const following = store.follows.filter((f) => f.followerId === targetId).length;
  const posts = store.posts.filter((p) => p.userId === targetId).length;
  const isFollowing = store.follows.some(
    (f) => f.followerId === userId && f.followingId === targetId
  );
  return res.json({
    user: toUserPublic(user),
    stats: { followers, following, posts },
    isFollowing
  });
});

app.post("/api/follows/:id", authMiddleware, (req, res) => {
  const targetId = Number(req.params.id);
  const userId = (req as AuthRequest).userId!;
  if (targetId === userId) {
    return res.status(400).json({ error: "Action impossible" });
  }
  const store = getStore();
  const existingIndex = store.follows.findIndex(
    (f) => f.followerId === userId && f.followingId === targetId
  );
  if (existingIndex >= 0) {
    store.follows.splice(existingIndex, 1);
    saveStore();
    return res.json({ following: false });
  }
  store.follows.push({ followerId: userId, followingId: targetId, createdAt: nowIso() });
  if (targetId !== userId) {
    store.notifications.push({
      id: nextId("notifications"),
      userId: targetId,
      type: "follow",
      actorId: userId,
      message: "Nouvel abonnement",
      isRead: false,
      createdAt: nowIso()
    });
  }
  saveStore();
  return res.json({ following: true });
});

app.post("/api/posts", authMiddleware, (req, res) => {
  const userId = (req as AuthRequest).userId!;
  const { content, imageUrl } = req.body || {};
  if (!content || String(content).trim().length < 1) {
    return res.status(400).json({ error: "Contenu requis" });
  }
  const store = getStore();
  const post = {
    id: nextId("posts"),
    userId,
    content: String(content).trim(),
    imageUrl: imageUrl || undefined,
    createdAt: nowIso()
  };
  store.posts.push(post);
  saveStore();
  return res.json({ post });
});

app.get("/api/posts", authMiddleware, (req, res) => {
  const userId = (req as AuthRequest).userId!;
  const limit = Math.min(Number(req.query.limit || 20), 50);
  const offset = Number(req.query.offset || 0);
  const store = getStore();
  const sortedPosts = [...store.posts].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const paged = sortedPosts.slice(offset, offset + limit);
  const posts = paged.map((post) => {
    const author = store.users.find((u) => u.id === post.userId);
    const likeCount = store.likes.filter((l) => l.postId === post.id).length;
    const commentCount = store.comments.filter((c) => c.postId === post.id).length;
    const likedByMe = store.likes.some(
      (l) => l.postId === post.id && l.userId === userId
    )
      ? 1
      : 0;
    return {
      id: post.id,
      user_id: post.userId,
      username: author?.username || "unknown",
      avatar_url: author?.avatarUrl,
      content: post.content,
      image_url: post.imageUrl,
      created_at: post.createdAt,
      likeCount,
      commentCount,
      likedByMe
    };
  });
  return res.json({ posts });
});

app.post("/api/posts/:id/like", authMiddleware, (req, res) => {
  const userId = (req as AuthRequest).userId!;
  const postId = Number(req.params.id);
  const store = getStore();
  const post = store.posts.find((p) => p.id === postId);
  if (!post) {
    return res.status(404).json({ error: "Post introuvable" });
  }
  const existingIndex = store.likes.findIndex(
    (like) => like.postId === postId && like.userId === userId
  );
  if (existingIndex >= 0) {
    store.likes.splice(existingIndex, 1);
    saveStore();
    return res.json({ liked: false });
  }
  store.likes.push({ postId, userId, createdAt: nowIso() });
  if (post.userId !== userId) {
    store.notifications.push({
      id: nextId("notifications"),
      userId: post.userId,
      type: "like",
      actorId: userId,
      postId,
      message: "Nouveau like",
      isRead: false,
      createdAt: nowIso()
    });
  }
  saveStore();
  return res.json({ liked: true });
});

app.get("/api/posts/:id/comments", authMiddleware, (req, res) => {
  const postId = Number(req.params.id);
  const store = getStore();
  const comments = store.comments
    .filter((comment) => comment.postId === postId)
    .map((comment) => {
      const author = store.users.find((u) => u.id === comment.userId);
      return {
        id: comment.id,
        post_id: comment.postId,
        user_id: comment.userId,
        username: author?.username || "unknown",
        content: comment.content,
        created_at: comment.createdAt
      };
    });
  return res.json({ comments });
});

app.post("/api/posts/:id/comments", authMiddleware, (req, res) => {
  const userId = (req as AuthRequest).userId!;
  const postId = Number(req.params.id);
  const { content } = req.body || {};
  if (!content || String(content).trim().length < 1) {
    return res.status(400).json({ error: "Contenu requis" });
  }
  const store = getStore();
  const post = store.posts.find((p) => p.id === postId);
  if (!post) {
    return res.status(404).json({ error: "Post introuvable" });
  }
  const commentId = nextId("comments");
  store.comments.push({
    id: commentId,
    postId,
    userId,
    content: String(content).trim(),
    createdAt: nowIso()
  });
  if (post.userId !== userId) {
    store.notifications.push({
      id: nextId("notifications"),
      userId: post.userId,
      type: "comment",
      actorId: userId,
      postId,
      commentId,
      message: "Nouveau commentaire",
      isRead: false,
      createdAt: nowIso()
    });
  }
  saveStore();
  return res.json({ commentId });
});

app.get("/api/conversations", authMiddleware, (req, res) => {
  const userId = (req as AuthRequest).userId!;
  const store = getStore();
  const partnerIds = new Set<number>();
  store.messages.forEach((message) => {
    if (message.fromId === userId) {
      partnerIds.add(message.toId);
    } else if (message.toId === userId) {
      partnerIds.add(message.fromId);
    }
  });
  const conversations = Array.from(partnerIds)
    .map((partnerId) => {
      const user = store.users.find((u) => u.id === partnerId);
      const lastMessage = store.messages
        .filter(
          (m) =>
            (m.fromId === userId && m.toId === partnerId) ||
            (m.fromId === partnerId && m.toId === userId)
        )
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )[0];
      return {
        user: user ? toUserPublic(user) : { id: partnerId, username: "unknown" },
        lastMessage
      };
    })
    .sort((a, b) => {
      const aTime = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bTime = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  return res.json({ conversations });
});

app.get("/api/messages/:id", authMiddleware, (req, res) => {
  const userId = (req as AuthRequest).userId!;
  const partnerId = Number(req.params.id);
  const store = getStore();
  const messages = store.messages
    .filter(
      (m) =>
        (m.fromId === userId && m.toId === partnerId) ||
        (m.fromId === partnerId && m.toId === userId)
    )
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  return res.json({ messages });
});

app.post("/api/messages/:id", authMiddleware, (req, res) => {
  const userId = (req as AuthRequest).userId!;
  const partnerId = Number(req.params.id);
  const { content } = req.body || {};
  if (!content || String(content).trim().length < 1) {
    return res.status(400).json({ error: "Contenu requis" });
  }
  const store = getStore();
  const partner = store.users.find((u) => u.id === partnerId);
  if (!partner) {
    return res.status(404).json({ error: "Utilisateur introuvable" });
  }
  const message = {
    id: nextId("messages"),
    fromId: userId,
    toId: partnerId,
    content: String(content).trim(),
    createdAt: nowIso()
  };
  store.messages.push(message);
  if (partnerId !== userId) {
    store.notifications.push({
      id: nextId("notifications"),
      userId: partnerId,
      type: "message",
      actorId: userId,
      message: "Nouveau message",
      isRead: false,
      createdAt: nowIso()
    });
  }
  saveStore();
  return res.json({ message });
});

app.get("/api/notifications", authMiddleware, (req, res) => {
  const userId = (req as AuthRequest).userId!;
  const store = getStore();
  const notifications = store.notifications
    .filter((notification) => notification.userId === userId)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .slice(0, 30)
    .map((notification) => {
      const actor = store.users.find((u) => u.id === notification.actorId);
      return {
        id: notification.id,
        type: notification.type,
        message: notification.message,
        actor_username: actor?.username,
        created_at: notification.createdAt,
        is_read: notification.isRead ? 1 : 0
      };
    });
  return res.json({ notifications });
});

app.post("/api/notifications/read", authMiddleware, (req, res) => {
  const userId = (req as AuthRequest).userId!;
  const store = getStore();
  store.notifications = store.notifications.map((notification) =>
    notification.userId === userId
      ? { ...notification, isRead: true }
      : notification
  );
  saveStore();
  return res.json({ ok: true });
});

const webDist = path.join(__dirname, "..", "..", "web", "dist");
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(webDist, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});
