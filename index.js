import "expo-router/entry";
import TrackPlayer from "react-native-track-player";

if (TrackPlayer && typeof TrackPlayer.registerPlaybackService === 'function') {
  TrackPlayer.registerPlaybackService(() =>
    require("./services/track-player-service")
  );
}