import React from 'react';
import { theme } from '../../lib/appTheme';
import type { ServerConfig } from '../../types';
import type { StorageDirectory } from '../../lib/storageDirectory';
import BookCover from '../BookCover';

const COVER_W = 48;
const COVER_H = 72;
const OVERLAP = 16;

export default function ShelfCoverStack({
  bookIds,
  serverConfig,
  storageDirectory,
}: {
  bookIds: string[];
  serverConfig: ServerConfig;
  storageDirectory?: StorageDirectory | null;
}) {
  const ids = bookIds.map(String).filter(Boolean).slice(0, 4);
  if (!ids.length) return null;

  return (
    <div className="flex items-end h-[72px]" aria-hidden>
      {ids.map((id, index) => (
        <span
          key={id}
          className="book-cover shrink-0"
          style={{
            width: COVER_W,
            height: COVER_H,
            marginLeft: index === 0 ? 0 : -OVERLAP,
            zIndex: ids.length - index,
          }}
        >
          <span className="book-cover-inner">
            <BookCover
              bookId={id}
              serverConfig={serverConfig}
              storageDirectory={storageDirectory}
              variant="thumb"
              width={COVER_W}
              height={COVER_H}
              className={`absolute inset-0 w-full h-full !rounded-none !border-0 ${theme.coverBorder}`}
            />
          </span>
        </span>
      ))}
    </div>
  );
}
