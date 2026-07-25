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
    <OnlineSearchTab 
      onSelectMedia={onSelectMedia}
      tmdbApiKey={tmdbApiKey}
      traktAccessToken={traktAccessToken}
    />
  );
};
