import fs from "fs";
import path from "path";

export type User = {
  id: number;
  email: string;
  username: string;
  passwordHash: string;
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  phone?: string;
  address?: string;
  consentAt?: string;
  privacyVersion?: string;
  preferredChannel?: "email" | "sms";
  emailVerified?: boolean;
  phoneVerified?: boolean;
  avatarUrl?: string;
  bio?: string;
  createdAt: string;
};

export type Post = {
  id: number;
  userId: number;
  content: string;
  imageUrl?: string;
  createdAt: string;
};

export type Comment = {
  id: number;
  postId: number;
  userId: number;
  content: string;
  createdAt: string;
};

export type Like = {
  postId: number;
  userId: number;
  createdAt: string;
};

export type Follow = {
  followerId: number;
  followingId: number;
  createdAt: string;
};

export type Notification = {
  id: number;
  userId: number;
  type: string;
  actorId?: number;
  postId?: number;
  commentId?: number;
  message?: string;
  isRead: boolean;
  createdAt: string;
};

export type VerificationCode = {
  id: number;
  userId: number;
  channel: "email" | "sms";
  codeHash: string;
  expiresAt: string;
  createdAt: string;
};

export type Message = {
  id: number;
  fromId: number;
  toId: number;
  content: string;
  createdAt: string;
};

type Counters = {
  users: number;
  posts: number;
  comments: number;
  notifications: number;
  messages: number;
  verificationCodes: number;
};

export type DataStore = {
  users: User[];
  posts: Post[];
  comments: Comment[];
  likes: Like[];
  follows: Follow[];
  notifications: Notification[];
  verificationCodes: VerificationCode[];
  messages: Message[];
  counters: Counters;
};

const dataDir = path.join(__dirname, "..", "data");
const dataPath = path.join(dataDir, "data.json");

const defaultData: DataStore = {
  users: [],
  posts: [],
  comments: [],
  likes: [],
  follows: [],
  notifications: [],
  verificationCodes: [],
  messages: [],
  counters: {
    users: 0,
    posts: 0,
    comments: 0,
    notifications: 0,
    messages: 0,
    verificationCodes: 0
  }
};

let store: DataStore = defaultData;

export const loadStore = () => {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (fs.existsSync(dataPath)) {
    const raw = fs.readFileSync(dataPath, "utf-8");
    const parsed = JSON.parse(raw) as DataStore;
    store = {
      ...defaultData,
      ...parsed,
      counters: {
        ...defaultData.counters,
        ...(parsed?.counters || {})
      }
    };
  } else {
    store = defaultData;
    saveStore();
  }
};

export const saveStore = () => {
  fs.writeFileSync(dataPath, JSON.stringify(store, null, 2), "utf-8");
};

export const getStore = () => store;

export const nextId = (key: keyof Counters) => {
  store.counters[key] += 1;
  return store.counters[key];
};
