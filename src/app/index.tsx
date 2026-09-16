import React from 'react';
import {
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTheme } from '@/hooks/use-theme';

const sections = [
  { key: 'cardapio', label: 'Cardápio', icon: '🍽️', route: '/cardapio' },
  { key: 'pedidos', label: 'Pedidos', icon: '📋', route: '/pedidos' },
  { key: 'estoque', label: 'Estoque', icon: '📦', route: '/estoque' },
  { key: 'financeiro', label: 'Financeiro', icon: '💰', route: '/financeiro' },
] as const;

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <LinearGradient
        colors={[theme.gradientStart, theme.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>Organiza+</Text>
        <Text style={styles.headerSubtitle}>Painel principal</Text>
      </LinearGradient>

      {/* Grid */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grid}>
          {sections.map((section) => (
            <TouchableOpacity
              key={section.key}
              activeOpacity={0.8}
              style={[
                styles.card,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.inputBorder,
                },
              ]}
              onPress={() => router.push(section.route as any)}
            >
              <Text style={styles.cardIcon}>{section.icon}</Text>
              <Text style={[styles.cardLabel, { color: theme.text }]}>
                {section.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 28,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 16,
  },
  card: {
    width: '47%',
    aspectRatio: 1,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  cardIcon: {
    fontSize: 40,
  },
  cardLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
});