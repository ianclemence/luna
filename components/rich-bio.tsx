import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { ThemedText } from "./themed-text";
import { Colors, Fonts, FontSizes } from "../constants/theme";
import { useColorScheme } from "../hooks/use-color-scheme";

interface RichBioProps {
  text: string;
  numberOfLines?: number;
}

interface BioPart {
  text: string;
  type: "text" | "link";
  linkType?: "artist" | "album" | "track" | "playlist";
  linkId?: string;
}

export const RichBio = ({ text, numberOfLines }: RichBioProps) => {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];

  const parsedParts = useMemo(() => {
    if (!text) return [];

    const linkTypes = ["artist", "album", "track", "playlist"];
    let parts: BioPart[] = [{ text, type: "text" }];

    // Parse [wimpLink typeId="..."]Name[/wimpLink]
    linkTypes.forEach((type) => {
      const regex = new RegExp(`\\[wimpLink ${type}Id="([a-f\\d-]+)"\\](.*?)\\[\\/wimpLink\\]`, "g");
      const newParts: BioPart[] = [];

      parts.forEach((part) => {
        if (part.type !== "text") {
          newParts.push(part);
          return;
        }

        let lastIndex = 0;
        let match;
        while ((match = regex.exec(part.text)) !== null) {
          if (match.index > lastIndex) {
            newParts.push({
              text: part.text.substring(lastIndex, match.index),
              type: "text",
            });
          }
          newParts.push({
            text: match[2],
            type: "link",
            linkType: type as any,
            linkId: match[1],
          });
          lastIndex = regex.lastIndex;
        }

        if (lastIndex < part.text.length) {
          newParts.push({
            text: part.text.substring(lastIndex),
            type: "text",
          });
        }
      });
      parts = newParts;
    });

    // Parse [[Name|ID]] (assumed to be artist links)
    const doubleBracketRegex = /\[\[(.*?)\|(.*?)\]\]/g;
    const finalParts: BioPart[] = [];

    parts.forEach((part) => {
      if (part.type !== "text") {
        finalParts.push(part);
        return;
      }

      let lastIndex = 0;
      let match;
      while ((match = doubleBracketRegex.exec(part.text)) !== null) {
        if (match.index > lastIndex) {
          finalParts.push({
            text: part.text.substring(lastIndex, match.index),
            type: "text",
          });
        }
        finalParts.push({
          text: match[1],
          type: "link",
          linkType: "artist",
          linkId: match[2],
        });
        lastIndex = doubleBracketRegex.lastIndex;
      }

      if (lastIndex < part.text.length) {
        finalParts.push({
          text: part.text.substring(lastIndex),
          type: "text",
        });
      }
    });

    return finalParts;
  }, [text]);

  const handleLinkPress = (type: string, id: string) => {
    // Standardize IDs (add prefix if missing)
    let formattedId = id;
    if (!id.startsWith("t:") && !id.startsWith("q:")) {
      formattedId = `t:${id}`;
    }

    const path = `/${type}/[id]`;
    router.push({
      pathname: path as any,
      params: { id: formattedId },
    });
  };

  return (
    <View style={styles.container}>
      <ThemedText style={styles.bioText} numberOfLines={numberOfLines}>
        {parsedParts.map((part, index) => {
          if (part.type === "link") {
            return (
              <ThemedText
                key={index}
                style={[styles.link, { color: colors.accent }]}
                onPress={() => handleLinkPress(part.linkType!, part.linkId!)}
              >
                {part.text}
              </ThemedText>
            );
          }
          return <ThemedText key={index}>{part.text}</ThemedText>;
        })}
      </ThemedText>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  bioText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    lineHeight: 24,
    opacity: 0.7,
  },
  link: {
    fontFamily: Fonts.semiBold,
    textDecorationLine: "underline",
  },
});
