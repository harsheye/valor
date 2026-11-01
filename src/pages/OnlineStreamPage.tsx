import React from 'react';
import { OnlineSearchTab } from '../components/OnlineSearchTab';

interface OnlineStreamPageProps {
  onSelectMedia: (media: any) => void;
  tmdbApiKey?: string;
  traktAccessToken?: string;
}

export const OnlineStreamPage: React.FC<OnlineStreamPageProps> = ({
  onSelectMedia,
  tmdbApiKey,
  traktAccessToken,
}) => {
  return (
    <div
      className="online-stream-page"
      style={{
        width: '100%',
        height: '100%',
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      <OnlineSearchTab 
        onSelectMedia={onSelectMedia}
        tmdbApiKey={tmdbApiKey}
        traktAccessToken={traktAccessToken}
      />
    </div>
  );
};
