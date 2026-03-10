import { usePlayer } from "./use-player";

/**
 * Custom hook to calculate the dynamic padding needed at the bottom of scrollable views.
 * Accounts for the Tab Bar height (80px) and the Player Bar height (72px) when a track is active.
 */
export const useBottomPadding = () => {
  const { currentTrack } = usePlayer();

  // The Tab Bar in app/(tabs)/_layout.tsx is 80px high
  const TAB_BAR_HEIGHT = 80;

  // The Player Bar in components/player-bar.tsx is 72px high
  const PLAYER_BAR_HEIGHT = 72;

  // Base padding is always the Tab Bar height
  let padding = TAB_BAR_HEIGHT;

  // If a track is active, the Player Bar is visible above the Tab Bar
  if (currentTrack) {
    padding += PLAYER_BAR_HEIGHT;
  }

  // Add a small extra buffer for visual comfort (optional, e.g., 16px)
  padding += 16;

  return padding;
};
