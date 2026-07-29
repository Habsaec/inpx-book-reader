export interface Book {
  id: string;
  title: string;
  author: string;
  genre?: string;
  subgenre?: string;
  series?: string;
  seriesNo?: number;
  /** Raw volume label for UI (may be non-numeric, e.g. "1-2") */
  seriesNoLabel?: string;
  ext: string;
  size?: number;
  description?: string;
  date?: string;
  genresDisplay?: string[];
  coverUrl?: string;
  content?: string; // Parsed chapters JSON (in-app storage only)
  localFileName?: string; // Relative path in picked folder, e.g. "Author/Series/1-Title.fb2"
  storageUri?: string;
  chaptersPath?: string; // Parsed chapters in .inpx-reader/{safeBookIdFileKey}.json
  rating?: number; // Public rating
  userRating?: number; // User personal rating (1-5)
  downloadsCount?: number;
  year?: number;
  isFavorite?: boolean;
  shelves?: string[]; // IDs of shelves this book belongs to
  contentUrl?: string; // Real OPDS download URL
  readProgress?: number; // 0–100, from server or local sync
}

export interface Author {
  id: string;
  name: string;
  bookCount?: number;
}

export interface Genre {
  code: string;
  name: string;
  count?: number;
}

export interface Series {
  name: string;
  bookCount?: number;
}

export interface ReadingProgress {
  bookId: string;
  bookTitle: string;
  authorName: string;
  currentChapter: number;
  percentage: number; // 0 to 100
  scrollPosition: number;
  charPosition: number; // For precise word alignment
  lastRead: number; // Timestamp
  finished: boolean;
}

export interface Bookmark {
  id: string;
  bookId: string;
  title: string;
  text: string;
  charPosition: number;
  chapter?: number;
  percentage: number;
  createdAt: number;
  note?: string; // Custom user note attached to bookmark
}

export interface Highlight {
  id: string;
  bookId: string;
  text: string;
  color: 'yellow' | 'green' | 'blue' | 'pink' | 'purple';
  charPosition: number;
  chapter?: number;
  createdAt: number;
}

export interface ServerConfig {
  url: string;
  username?: string;
  password?: string;
  /** Bearer token from POST /api/auth/device (Android keystore) */
  deviceToken?: string;
  deviceTokenId?: string;
  connectionStatus: 'connected' | 'disconnected' | 'testing';
}

export interface SyncData {
  progressList: ReadingProgress[];
  bookmarks: Bookmark[];
  highlights: Highlight[];
  updatedAt: number;
}

export interface SyncState {
  syncKey: string;
  lastSynced: number;
  status: 'idle' | 'syncing' | 'error' | 'success';
}

export interface Shelf {
  id: string;
  name: string;
  bookIds: string[];
}

export interface Review {
  id: string;
  bookId: string;
  username: string;
  text: string;
  rating: number;
  date: string;
}
