import * as FileSystem from "expo-file-system/legacy";
import { Track } from "./types";

const LOCAL_DIR = "local-tracks/";

function fileNameToMetadata(name: string): { title: string; artist: string } {
  const withoutExt = name.replace(/\.[^/.]+$/, "").trim();
  const parts = withoutExt.split(" - ");
  if (parts.length >= 2) {
    return { artist: parts[0].trim(), title: parts.slice(1).join(" - ").trim() };
  }
  return { artist: "Unknown Artist", title: withoutExt };
}

let localIdCounter = Date.now();

export async function importAudioFile(uri: string, fileName: string): Promise<Track | null> {
  try {
    const dir = FileSystem.documentDirectory + LOCAL_DIR;
    const dirInfo = await FileSystem.getInfoAsync(dir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }

    const dest = dir + `${localIdCounter}_${fileName}`;
    await FileSystem.copyAsync({ from: uri, to: dest });

    const fileInfo = await FileSystem.getInfoAsync(dest);
    if (!fileInfo.exists) return null;

    const { title, artist } = fileNameToMetadata(fileName);
    const id = `local:${localIdCounter++}`;

    return {
      id,
      title,
      artist: { id: "", name: artist },
      artists: [{ id: "", name: artist }],
      album: { id: "", title: "Local Files" },
      duration: 0,
      provider: "local",
      quality: "LOSSLESS",
      localUri: dest,
    };
  } catch (e) {
    console.warn("[LocalMedia] Import failed:", e);
    return null;
  }
}

export function getLocalTracksDir(): string {
  return FileSystem.documentDirectory + LOCAL_DIR;
}
