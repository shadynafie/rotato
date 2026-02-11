import { Box, Button, PasswordInput, Text, TextInput } from '@mantine/core';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email, password);
      nav('/');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f5f5f7',
        padding: '24px',
      }}
    >
      <Box
        style={{
          width: '100%',
          maxWidth: 400,
          animation: 'fadeIn 0.4s ease-out',
        }}
      >
        {/* Logo/Brand */}
        <Box ta="center" mb={40}>
          <img
            src="/icon-192.png"
            alt="Rotato"
            width={72}
            height={72}
            style={{
              borderRadius: 16,
              margin: '0 auto 20px',
              display: 'block',
            }}
          />
          <Text
            style={{
              fontSize: '1.75rem',
              fontWeight: 600,
              color: '#1d1d1f',
              letterSpacing: '-0.02em',
              marginBottom: 8,
            }}
          >
            Rotato
          </Text>
          <Text
            style={{
              fontSize: '1rem',
              color: '#86868b',
            }}
          >
            Sign in to manage your team's schedule
          </Text>
        </Box>

        {/* Login Card */}
        <Box
          style={{
            backgroundColor: '#ffffff',
            borderRadius: 20,
            padding: 32,
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
          }}
        >
          <form onSubmit={onSubmit}>
            <Box mb={20}>
              <TextInput
                label="Email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                required
                size="md"
                styles={{
                  label: {
                    marginBottom: 8,
                    fontWeight: 500,
                    color: '#1d1d1f',
                  },
                  input: {
                    height: 48,
                    fontSize: '1rem',
                    border: '1px solid #d2d2d7',
                  },
                }}
              />
            </Box>

            <Box mb={24}>
              <PasswordInput
                label="Password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                required
                size="md"
                styles={{
                  label: {
                    marginBottom: 8,
                    fontWeight: 500,
                    color: '#1d1d1f',
                  },
                  input: {
                    height: 48,
                    fontSize: '1rem',
                    border: '1px solid #d2d2d7',
                  },
                }}
              />
            </Box>

            {error && (
              <Box
                mb={20}
                p={12}
                style={{
                  backgroundColor: 'rgba(255, 59, 48, 0.08)',
                  borderRadius: 10,
                }}
              >
                <Text size="sm" c="#ff3b30" fw={500}>
                  {error}
                </Text>
              </Box>
            )}

            <Button
              type="submit"
              loading={loading}
              fullWidth
              size="lg"
              styles={{
                root: {
                  height: 50,
                  fontSize: '1rem',
                  fontWeight: 500,
                  backgroundColor: '#0071e3',
                },
              }}
            >
              Sign In
            </Button>
          </form>
        </Box>

        {/* Footer hint */}
        <Text
          ta="center"
          mt={24}
          style={{
            fontSize: '0.875rem',
            color: '#86868b',
          }}
        >
          Default: admin@example.com / admin123
        </Text>
      </Box>
    </Box>
  );
};
