import React, { useState } from 'react';
import {
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTheme } from '@/hooks/use-theme';

export default function CadastroScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');

  function handleCadastro() {
    // TODO: integrar com autenticação real
    console.log('Cadastro:', nome, email, senha);
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.form}
      >
        <LinearGradient
          colors={[theme.gradientStart, theme.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.headerBar}
        />

        <Text style={[styles.title, { color: theme.text }]}>Criar conta</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Preencha seus dados
        </Text>

        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.inputBackground,
              borderColor: theme.inputBorder,
              color: theme.text,
            },
          ]}
          placeholder="Nome"
          placeholderTextColor={theme.placeholder}
          value={nome}
          onChangeText={setNome}
        />

        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.inputBackground,
              borderColor: theme.inputBorder,
              color: theme.text,
            },
          ]}
          placeholder="E-mail"
          placeholderTextColor={theme.placeholder}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.inputBackground,
              borderColor: theme.inputBorder,
              color: theme.text,
            },
          ]}
          placeholder="Senha"
          placeholderTextColor={theme.placeholder}
          value={senha}
          onChangeText={setSenha}
          secureTextEntry
        />

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleCadastro}
          style={styles.buttonWrapper}
        >
          <LinearGradient
            colors={[theme.gradientStart, theme.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Cadastrar</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.link, { color: theme.accent }]}>
            Já tenho conta
          </Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  form: {
    paddingHorizontal: 24,
  },
  headerBar: {
    height: 4,
    borderRadius: 2,
    width: 48,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 32,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    marginBottom: 16,
  },
  buttonWrapper: {
    marginTop: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  button: {
    paddingVertical: 15,
    alignItems: 'center',
    borderRadius: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  link: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 14,
    fontWeight: '500',
  },
});
