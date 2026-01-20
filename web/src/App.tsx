import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch, getToken, setToken } from "./api";

type User = {
  id: number;
  email: string;
  username: string;
  avatarUrl?: string;
  bio?: string;
  createdAt: string;
  isFollowing?: boolean;
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  phone?: string;
};

type Stats = {
  followers: number;
  following: number;
  posts: number;
};

type Post = {
  id: number;
  user_id: number;
  username: string;
  avatar_url?: string;
  content: string;
  image_url?: string;
  created_at: string;
  likeCount: number;
  commentCount: number;
  likedByMe?: number;
};

type Comment = {
  id: number;
  post_id: number;
  user_id: number;
  username: string;
  content: string;
  created_at: string;
};

type Notification = {
  id: number;
  type: string;
  message?: string;
  actor_username?: string;
  created_at: string;
  is_read: number;
};

type Message = {
  id: number;
  fromId: number;
  toId: number;
  content: string;
  createdAt: string;
};

type Conversation = {
  user: User;
  lastMessage?: Message;
};

const initialAuth = {
  email: "",
  username: "",
  password: "",
  firstName: "",
  lastName: "",
  birthDate: "",
  phone: "",
  address: "",
  preferredChannel: "email",
  consent: false
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short"
  });

const App = () => {
  const [token, setTokenState] = useState(getToken());
  const [me, setMe] = useState<User | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [commentsByPost, setCommentsByPost] = useState<Record<number, Comment[]>>(
    {}
  );
  const [expandedPosts, setExpandedPosts] = useState<number[]>([]);
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>(
    {}
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [followState, setFollowState] = useState<Record<number, boolean>>({});
  const [feedDraft, setFeedDraft] = useState("");
  const [imageDraft, setImageDraft] = useState("");
  const [profileDraft, setProfileDraft] = useState({
    username: "",
    avatarUrl: "",
    bio: ""
  });
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeChat, setActiveChat] = useState<User | null>(null);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authForm, setAuthForm] = useState(initialAuth);
  const [verificationUserId, setVerificationUserId] = useState<number | null>(
    null
  );
  const [verificationChannel, setVerificationChannel] = useState<"email" | "sms">(
    "email"
  );
  const [verificationCode, setVerificationCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const unreadCount = useMemo(
    () => notifications.filter((n) => n.is_read === 0).length,
    [notifications]
  );

  const loadMe = async () => {
    const data = await apiFetch<{ user: User; stats: Stats }>("/api/me");
    setMe(data.user);
    setStats(data.stats);
  };

  const loadFeed = async () => {
    const data = await apiFetch<{ posts: Post[] }>("/api/posts");
    setPosts(data.posts);
  };

  const loadNotifications = async () => {
    const data = await apiFetch<{ notifications: Notification[] }>(
      "/api/notifications"
    );
    setNotifications(data.notifications);
  };

  const loadConversations = async () => {
    const data = await apiFetch<{ conversations: Conversation[] }>(
      "/api/conversations"
    );
    setConversations(data.conversations);
  };

  const loadMessages = async (userId: number) => {
    const data = await apiFetch<{ messages: Message[] }>(`/api/messages/${userId}`);
    setChatMessages(data.messages);
  };

  useEffect(() => {
    if (!token) {
      return;
    }
    setLoading(true);
    Promise.all([loadMe(), loadFeed(), loadNotifications(), loadConversations()])
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const handle = setTimeout(() => {
      apiFetch<{ users: User[] }>(`/api/users/search?q=${searchQuery.trim()}`)
        .then((data) => setSearchResults(data.users))
        .catch(() => setSearchResults([]));
    }, 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  useEffect(() => {
    if (!me) {
      return;
    }
    setProfileDraft({
      username: me.username || "",
      avatarUrl: me.avatarUrl || "",
      bio: me.bio || ""
    });
  }, [me]);

  const handleAuth = async () => {
    setError("");
    setLoading(true);
    try {
      const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload =
        authMode === "login"
          ? { email: authForm.email, password: authForm.password }
          : authForm;
      const data = await apiFetch<any>(endpoint, {
        method: "POST",
        json: payload
      });
      if (data.status === "verification_required") {
        setVerificationUserId(data.userId);
        setVerificationChannel(data.channel);
        setVerificationCode("");
        setAuthMode("login");
        return;
      }
      setToken(data.token);
      setTokenState(data.token);
      setMe(data.user);
      setAuthForm(initialAuth);
      await Promise.all([
        loadFeed(),
        loadNotifications(),
        loadConversations(),
        loadMe()
      ]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setToken("");
    setTokenState("");
    setMe(null);
    setStats(null);
    setPosts([]);
    setNotifications([]);
    setConversations([]);
    setActiveChat(null);
    setChatMessages([]);
  };

  const requestVerificationCode = async () => {
    if (!verificationUserId) return;
    await apiFetch("/api/auth/request-code", {
      method: "POST",
      json: { userId: verificationUserId, channel: verificationChannel }
    });
  };

  const verifyAccount = async () => {
    if (!verificationUserId || !verificationCode.trim()) {
      return;
    }
    await apiFetch("/api/auth/verify", {
      method: "POST",
      json: {
        userId: verificationUserId,
        channel: verificationChannel,
        code: verificationCode.trim()
      }
    });
    setVerificationUserId(null);
    setVerificationCode("");
  };

  const handleCreatePost = async () => {
    if (!feedDraft.trim()) {
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/api/posts", {
        method: "POST",
        json: { content: feedDraft.trim(), imageUrl: imageDraft.trim() || undefined }
      });
      setFeedDraft("");
      setImageDraft("");
      await loadFeed();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleLike = async (post: Post) => {
    try {
      await apiFetch(`/api/posts/${post.id}/like`, { method: "POST" });
      setPosts((prev) =>
        prev.map((item) =>
          item.id === post.id
            ? {
                ...item,
                likedByMe: item.likedByMe ? 0 : 1,
                likeCount: item.likedByMe ? item.likeCount - 1 : item.likeCount + 1
              }
            : item
        )
      );
    } catch (err: any) {
      setError(err.message);
    }
  };

  const toggleComments = async (postId: number) => {
    if (expandedPosts.includes(postId)) {
      setExpandedPosts((prev) => prev.filter((id) => id !== postId));
      return;
    }
    setExpandedPosts((prev) => [...prev, postId]);
    if (!commentsByPost[postId]) {
      const data = await apiFetch<{ comments: Comment[] }>(
        `/api/posts/${postId}/comments`
      );
      setCommentsByPost((prev) => ({ ...prev, [postId]: data.comments }));
    }
  };

  const handleComment = async (postId: number) => {
    const draft = commentDrafts[postId] || "";
    if (!draft.trim()) {
      return;
    }
    await apiFetch(`/api/posts/${postId}/comments`, {
      method: "POST",
      json: { content: draft.trim() }
    });
    setCommentDrafts((prev) => ({ ...prev, [postId]: "" }));
    const data = await apiFetch<{ comments: Comment[] }>(
      `/api/posts/${postId}/comments`
    );
    setCommentsByPost((prev) => ({ ...prev, [postId]: data.comments }));
    setPosts((prev) =>
      prev.map((item) =>
        item.id === postId
          ? { ...item, commentCount: item.commentCount + 1 }
          : item
      )
    );
  };

  const handleFollow = async (userId: number) => {
    const data = await apiFetch<{ following: boolean }>(`/api/follows/${userId}`, {
      method: "POST"
    });
    setFollowState((prev) => ({ ...prev, [userId]: data.following }));
    setSearchResults((prev) =>
      prev.map((user) =>
        user.id === userId ? { ...user, isFollowing: data.following } : user
      )
    );
  };

  const handleProfileSave = async () => {
    setError("");
    try {
      const data = await apiFetch<{ user: User }>("/api/me", {
        method: "PUT",
        json: {
          username: profileDraft.username.trim(),
          avatarUrl: profileDraft.avatarUrl.trim(),
          bio: profileDraft.bio.trim()
        }
      });
      setMe(data.user);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const openConversation = async (user: User) => {
    setActiveChat(user);
    await loadMessages(user.id);
  };

  const handleSendMessage = async () => {
    if (!activeChat || !chatDraft.trim()) {
      return;
    }
    await apiFetch(`/api/messages/${activeChat.id}`, {
      method: "POST",
      json: { content: chatDraft.trim() }
    });
    setChatDraft("");
    await Promise.all([loadMessages(activeChat.id), loadConversations()]);
  };

  const markNotificationsRead = async () => {
    await apiFetch("/api/notifications/read", { method: "POST" });
    await loadNotifications();
  };

  if (!token) {
    return (
      <div className="app">
        <div className="panel">
          <div className="brand">Hey Social</div>
          <p className="muted">
            Un reseau social clair, rapide et respectueux des utilisateurs.
          </p>
        </div>
        <div className="panel">
          <h3>{authMode === "login" ? "Connexion" : "Inscription"}</h3>
          <div className="stack">
            <input
              className="input"
              placeholder="Email"
              value={authForm.email}
              onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
            />
            {authMode === "register" && (
              <input
                className="input"
                placeholder="Prenom"
                value={authForm.firstName}
                onChange={(e) =>
                  setAuthForm({ ...authForm, firstName: e.target.value })
                }
              />
            )}
            {authMode === "register" && (
              <input
                className="input"
                placeholder="Nom"
                value={authForm.lastName}
                onChange={(e) =>
                  setAuthForm({ ...authForm, lastName: e.target.value })
                }
              />
            )}
            {authMode === "register" && (
              <input
                className="input"
                placeholder="Date de naissance (AAAA-MM-JJ)"
                value={authForm.birthDate}
                onChange={(e) =>
                  setAuthForm({ ...authForm, birthDate: e.target.value })
                }
              />
            )}
            {authMode === "register" && (
              <input
                className="input"
                placeholder="Telephone"
                value={authForm.phone}
                onChange={(e) =>
                  setAuthForm({ ...authForm, phone: e.target.value })
                }
              />
            )}
            {authMode === "register" && (
              <input
                className="input"
                placeholder="Adresse (optionnel)"
                value={authForm.address}
                onChange={(e) =>
                  setAuthForm({ ...authForm, address: e.target.value })
                }
              />
            )}
            {authMode === "register" && (
              <input
                className="input"
                placeholder="Nom utilisateur"
                value={authForm.username}
                onChange={(e) =>
                  setAuthForm({ ...authForm, username: e.target.value })
                }
              />
            )}
            <input
              className="input"
              placeholder="Mot de passe"
              type="password"
              value={authForm.password}
              onChange={(e) =>
                setAuthForm({ ...authForm, password: e.target.value })
              }
            />
            {authMode === "register" && (
              <div className="stack">
                <label className="muted">Verification par defaut</label>
                <select
                  className="input"
                  value={authForm.preferredChannel}
                  onChange={(e) =>
                    setAuthForm({
                      ...authForm,
                      preferredChannel: e.target.value
                    })
                  }
                >
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                </select>
                <label className="muted">
                  <input
                    type="checkbox"
                    checked={authForm.consent}
                    onChange={(e) =>
                      setAuthForm({ ...authForm, consent: e.target.checked })
                    }
                  />{" "}
                  J'accepte la politique de confidentialite
                </label>
                <Link className="button ghost" to="/privacy">
                  Lire la politique
                </Link>
              </div>
            )}
            {verificationUserId && (
              <div className="stack">
                <div className="notice">
                  Verification requise. Un code a ete envoye par{" "}
                  {verificationChannel === "sms" ? "SMS" : "email"}.
                </div>
                <input
                  className="input"
                  placeholder="Code de verification"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                />
                <div className="split">
                  <button className="button" onClick={verifyAccount}>
                    Verifier
                  </button>
                  <button className="button secondary" onClick={requestVerificationCode}>
                    Renvoyer
                  </button>
                </div>
              </div>
            )}
            {error && <div className="notice">{error}</div>}
            <button className="button" onClick={handleAuth} disabled={loading}>
              {loading ? "Chargement..." : "Valider"}
            </button>
            <button
              className="button secondary"
              onClick={() =>
                setAuthMode(authMode === "login" ? "register" : "login")
              }
            >
              {authMode === "login"
                ? "Creer un compte"
                : "J'ai deja un compte"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="panel stack">
        <div className="brand">Hey Social</div>
        {me && (
          <div className="stack">
            <div>
              <strong>@{me.username}</strong>
              <div className="muted">{me.email}</div>
            </div>
            {stats && (
              <div className="split">
                <span className="pill">Posts {stats.posts}</span>
                <span className="pill">Followers {stats.followers}</span>
                <span className="pill">Following {stats.following}</span>
              </div>
            )}
            <div className="stack">
              <input
                className="input"
                placeholder="Nom utilisateur"
                value={profileDraft.username}
                onChange={(e) =>
                  setProfileDraft({ ...profileDraft, username: e.target.value })
                }
              />
              <input
                className="input"
                placeholder="Lien avatar"
                value={profileDraft.avatarUrl}
                onChange={(e) =>
                  setProfileDraft({ ...profileDraft, avatarUrl: e.target.value })
                }
              />
              <textarea
                rows={3}
                placeholder="Bio courte"
                value={profileDraft.bio}
                onChange={(e) =>
                  setProfileDraft({ ...profileDraft, bio: e.target.value })
                }
              />
              <button className="button secondary" onClick={handleProfileSave}>
                Mettre a jour
              </button>
            </div>
            <button className="button secondary" onClick={handleLogout}>
              Se deconnecter
            </button>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="toolbar">
          <strong>Fil d'actualite</strong>
          <button className="button ghost" onClick={() => loadFeed()}>
            Rafraichir
          </button>
        </div>
        {error && <div className="notice">{error}</div>}
        <div className="stack">
          <textarea
            rows={3}
            placeholder="Partager une idee..."
            value={feedDraft}
            onChange={(e) => setFeedDraft(e.target.value)}
          />
          <input
            className="input"
            placeholder="Lien d'image (optionnel)"
            value={imageDraft}
            onChange={(e) => setImageDraft(e.target.value)}
          />
          <button className="button" onClick={handleCreatePost} disabled={loading}>
            Publier
          </button>
        </div>
        <div>
          {posts.map((post) => (
            <div className="post" key={post.id}>
              <div className="split">
                <strong>@{post.username}</strong>
                <span className="muted">{formatDate(post.created_at)}</span>
              </div>
              <p>{post.content}</p>
              {post.image_url && (
                <img
                  src={post.image_url}
                  alt="media"
                  style={{ width: "100%", borderRadius: 12, marginTop: 8 }}
                />
              )}
              <div className="post-actions">
                <button className="button ghost" onClick={() => handleToggleLike(post)}>
                  {post.likedByMe ? "Like" : "Like"} {post.likeCount}
                </button>
                <button
                  className="button ghost"
                  onClick={() => toggleComments(post.id)}
                >
                  Commentaires {post.commentCount}
                </button>
              </div>
              {expandedPosts.includes(post.id) && (
                <div className="stack" style={{ marginTop: 12 }}>
                  <div className="stack">
                    {(commentsByPost[post.id] || []).map((comment) => (
                      <div className="comment" key={comment.id}>
                        <strong>@{comment.username}</strong> {comment.content}
                      </div>
                    ))}
                  </div>
                  <div className="split">
                    <input
                      className="input"
                      placeholder="Ajouter un commentaire"
                      value={commentDrafts[post.id] || ""}
                      onChange={(e) =>
                        setCommentDrafts((prev) => ({
                          ...prev,
                          [post.id]: e.target.value
                        }))
                      }
                    />
                    <button
                      className="button"
                      onClick={() => handleComment(post.id)}
                    >
                      Envoyer
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="panel stack">
        <div className="toolbar">
          <strong>Recherche</strong>
        </div>
        <input
          className="input"
          placeholder="Chercher un utilisateur"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="stack">
          {searchResults.map((user) => (
            <div className="split" key={user.id}>
              <div>
                <strong>@{user.username}</strong>
                <div className="muted">{user.email}</div>
              </div>
              <div className="split">
                <button
                  className="button secondary"
                  onClick={() => handleFollow(user.id)}
                >
                  {followState[user.id] ?? user.isFollowing ? "Suivi" : "Suivre"}
                </button>
                <button className="button ghost" onClick={() => openConversation(user)}>
                  Message
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="toolbar" style={{ marginTop: 12 }}>
          <strong>Messages</strong>
        </div>
        <div className="stack">
          {conversations.map((conversation) => (
            <button
              key={conversation.user.id}
              className="button secondary"
              onClick={() => openConversation(conversation.user)}
            >
              @{conversation.user.username}
            </button>
          ))}
          {!conversations.length && (
            <div className="muted">Aucune conversation.</div>
          )}
        </div>
        {activeChat && (
          <div className="stack" style={{ marginTop: 12 }}>
            <strong>Discussion avec @{activeChat.username}</strong>
            <div className="message-list">
              {chatMessages.map((message) => (
                <div
                  key={message.id}
                  className={`message ${
                    message.fromId === me?.id ? "me" : "them"
                  }`}
                >
                  {message.content}
                </div>
              ))}
            </div>
            <div className="split">
              <input
                className="input"
                placeholder="Ecrire un message"
                value={chatDraft}
                onChange={(e) => setChatDraft(e.target.value)}
              />
              <button className="button" onClick={handleSendMessage}>
                Envoyer
              </button>
            </div>
          </div>
        )}

        <div className="toolbar" style={{ marginTop: 12 }}>
          <strong>Notifications</strong>
          <span className="pill">Non lues {unreadCount}</span>
          <button className="button ghost" onClick={markNotificationsRead}>
            Tout lire
          </button>
        </div>
        <div className="stack">
          {notifications.map((notif) => (
            <div className="notice" key={notif.id}>
              <div className="split">
                <span>
                  {notif.actor_username ? `@${notif.actor_username}` : "System"}{" "}
                  {notif.message || notif.type}
                </span>
                <span className="muted">{formatDate(notif.created_at)}</span>
              </div>
            </div>
          ))}
          {!notifications.length && <div className="muted">Aucune alerte.</div>}
        </div>
      </div>
    </div>
  );
};

export default App;
