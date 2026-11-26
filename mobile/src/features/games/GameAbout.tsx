import { useState, type ReactNode } from 'react';
import { Image, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Button, Pill, Text } from '@/components';
import { resolveImageUrl } from '@/lib/imageUrl';
import { colors, hairline, radii, space } from '@/theme/tokens';

import type { Game } from './types';

const SUMMARY_LINES = 6;
/** Rough size of six lines of text; shorter synopses never need the toggle. */
const COLLAPSE_ABOVE_CHARS = 280;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" size="xl" weight="bold" tone="high">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Pills({ items }: { items: string[] }) {
  return (
    <View style={styles.pills}>
      {items.map((item) => (
        <Pill key={item}>{item}</Pill>
      ))}
    </View>
  );
}

function Synopsis({ summary }: { summary: string | null }) {
  const [expanded, setExpanded] = useState(false);
  if (!summary) return <Text tone="medium">Este jogo ainda não tem sinopse.</Text>;

  const collapsible = summary.length > COLLAPSE_ABOVE_CHARS;
  return (
    <View style={styles.synopsis}>
      <Text numberOfLines={collapsible && !expanded ? SUMMARY_LINES : undefined} leading="relaxed">
        {summary}
      </Text>
      {collapsible ? (
        <Button
          variant="ghost"
          size="small"
          label={expanded ? 'Ler menos' : 'Ler mais'}
          onPress={() => setExpanded((current) => !current)}
        />
      ) : null}
    </View>
  );
}

export function GameAbout({ game }: { game: Game }) {
  const { width } = useWindowDimensions();
  const screenshotWidth = Math.min(320, width * 0.75);

  return (
    <View style={styles.root}>
      <Section title="Sinopse">
        <Synopsis summary={game.summary} />
      </Section>
      {game.screenshots.length > 0 ? (
        <Section title="Screenshots">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shots}>
            {game.screenshots.map((url, index) => (
              <Image
                key={`${url}-${index}`}
                accessibilityLabel={`Screenshot ${index + 1} de ${game.name}`}
                source={{ uri: resolveImageUrl(url) ?? url }}
                resizeMode="cover"
                style={[styles.shot, { width: screenshotWidth }]}
              />
            ))}
          </ScrollView>
        </Section>
      ) : null}
      {game.genres.length > 0 ? (
        <Section title="Gêneros">
          <Pills items={game.genres} />
        </Section>
      ) : null}
      {game.platforms.length > 0 ? (
        <Section title="Plataformas">
          <Pills items={game.platforms} />
        </Section>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space._2xl },
  section: { gap: space.md },
  synopsis: { alignItems: 'flex-start', gap: space.sm },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  shots: { gap: space.sm },
  shot: {
    aspectRatio: 16 / 9,
    borderRadius: radii.md,
    borderWidth: hairline,
    borderColor: colors.borderLow,
    backgroundColor: colors.bgContrast25,
  },
});
