import { Box, Button, Group, Loader, Stack, Text, UnstyledButton } from '@mantine/core';
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

interface Clinician {
  id: number;
  name: string;
  role: 'consultant' | 'registrar';
}

interface SubscribeInfo {
  clinician: Clinician;
  icalUrl: string;
  webcalUrl: string;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

type Step = 'grade' | 'clinician' | 'subscribe';

export const SubscribePage: React.FC = () => {
  const [step, setStep] = useState<Step>('grade');
  const [selectedRole, setSelectedRole] = useState<'consultant' | 'registrar' | null>(null);
  const [selectedClinician, setSelectedClinician] = useState<Clinician | null>(null);

  // Fetch clinicians
  const cliniciansQuery = useQuery({
    queryKey: ['subscribe-clinicians'],
    queryFn: async () => {
      const res = await axios.get<{ consultants: Clinician[]; registrars: Clinician[] }>(
        `${API_BASE}/subscribe/clinicians`
      );
      return res.data;
    },
  });

  // Fetch subscribe info when clinician is selected
  const subscribeInfoQuery = useQuery({
    queryKey: ['subscribe-info', selectedClinician?.id],
    queryFn: async () => {
      const res = await axios.get<SubscribeInfo>(
        `${API_BASE}/subscribe/${selectedClinician!.id}/info`
      );
      return res.data;
    },
    enabled: !!selectedClinician,
  });

  const handleSelectGrade = (role: 'consultant' | 'registrar') => {
    setSelectedRole(role);
    setStep('clinician');
  };

  const handleSelectClinician = (clinician: Clinician) => {
    setSelectedClinician(clinician);
    setStep('subscribe');
  };

  const handleBack = () => {
    if (step === 'clinician') {
      setStep('grade');
      setSelectedRole(null);
    } else if (step === 'subscribe') {
      setStep('clinician');
      setSelectedClinician(null);
    }
  };

  const handleSubscribe = () => {
    if (subscribeInfoQuery.data?.webcalUrl) {
      // Open webcal:// URL to trigger calendar subscription
      window.location.href = subscribeInfoQuery.data.webcalUrl;
    }
  };

  const clinicians = selectedRole === 'consultant'
    ? cliniciansQuery.data?.consultants || []
    : cliniciansQuery.data?.registrars || [];

  return (
    <Box
      style={{
        minHeight: '100vh',
        backgroundColor: '#f5f5f7',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <Box
        p="md"
        style={{
          backgroundColor: '#ffffff',
          borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
        }}
      >
        <Group gap="xs" justify="center">
          <img src="/icon-192.png" alt="Rotato" width={32} height={32} style={{ borderRadius: 8 }} />
          <Text
            style={{
              fontSize: '1.5rem',
              fontWeight: 600,
              color: '#0071e3',
              letterSpacing: '-0.02em',
            }}
          >
            Rotato
          </Text>
        </Group>
      </Box>

      {/* Content */}
      <Box
        p="xl"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          maxWidth: 480,
          margin: '0 auto',
          width: '100%',
        }}
      >
        {/* Back button */}
        {step !== 'grade' && (
          <UnstyledButton
            onClick={handleBack}
            mb="lg"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              color: '#0071e3',
              fontSize: '1rem',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Back
          </UnstyledButton>
        )}

        {/* Step 1: Select Grade */}
        {step === 'grade' && (
          <Stack gap="xl" style={{ flex: 1, justifyContent: 'center' }}>
            <Box ta="center" mb="xl">
              <Text
                style={{
                  fontSize: '1.75rem',
                  fontWeight: 700,
                  color: '#1d1d1f',
                  letterSpacing: '-0.025em',
                  marginBottom: 8,
                }}
              >
                Add Your Rota Calendar
              </Text>
              <Text style={{ fontSize: '1.0625rem', color: '#86868b' }}>
                Select your grade to get started
              </Text>
            </Box>

            {cliniciansQuery.isLoading ? (
              <Box ta="center" py={60}>
                <Loader size="lg" color="#0071e3" />
              </Box>
            ) : (
              <Stack gap="md">
                <UnstyledButton
                  onClick={() => handleSelectGrade('consultant')}
                  style={{
                    padding: 32,
                    backgroundColor: '#ffffff',
                    borderRadius: 16,
                    border: '1px solid rgba(0, 0, 0, 0.06)',
                    textAlign: 'center',
                    transition: 'all 150ms ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.02)';
                    e.currentTarget.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <Box
                    style={{
                      width: 64,
                      height: 64,
                      backgroundColor: 'rgba(0, 113, 227, 0.1)',
                      borderRadius: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 16px',
                    }}
                  >
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0071e3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                  </Box>
                  <Text fw={600} size="xl" c="#1d1d1f">Consultant</Text>
                  <Text c="dimmed" size="sm" mt={4}>
                    {cliniciansQuery.data?.consultants.length || 0} consultants
                  </Text>
                </UnstyledButton>

                <UnstyledButton
                  onClick={() => handleSelectGrade('registrar')}
                  style={{
                    padding: 32,
                    backgroundColor: '#ffffff',
                    borderRadius: 16,
                    border: '1px solid rgba(0, 0, 0, 0.06)',
                    textAlign: 'center',
                    transition: 'all 150ms ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.02)';
                    e.currentTarget.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <Box
                    style={{
                      width: 64,
                      height: 64,
                      backgroundColor: 'rgba(136, 84, 208, 0.1)',
                      borderRadius: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 16px',
                    }}
                  >
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#8854d0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                  </Box>
                  <Text fw={600} size="xl" c="#1d1d1f">Registrar</Text>
                  <Text c="dimmed" size="sm" mt={4}>
                    {cliniciansQuery.data?.registrars.length || 0} registrars
                  </Text>
                </UnstyledButton>
              </Stack>
            )}
          </Stack>
        )}

        {/* Step 2: Select Clinician */}
        {step === 'clinician' && (
          <Stack gap="lg">
            <Box ta="center" mb="md">
              <Text
                style={{
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  color: '#1d1d1f',
                  letterSpacing: '-0.025em',
                  marginBottom: 4,
                }}
              >
                Select Your Name
              </Text>
              <Text style={{ fontSize: '1rem', color: '#86868b' }}>
                {selectedRole === 'consultant' ? 'Consultants' : 'Registrars'}
              </Text>
            </Box>

            <Stack gap="xs">
              {clinicians.map((clinician) => (
                <UnstyledButton
                  key={clinician.id}
                  onClick={() => handleSelectClinician(clinician)}
                  style={{
                    padding: 20,
                    backgroundColor: '#ffffff',
                    borderRadius: 12,
                    border: '1px solid rgba(0, 0, 0, 0.06)',
                    transition: 'all 150ms ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(0, 113, 227, 0.04)';
                    e.currentTarget.style.borderColor = 'rgba(0, 113, 227, 0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#ffffff';
                    e.currentTarget.style.borderColor = 'rgba(0, 0, 0, 0.06)';
                  }}
                >
                  <Group justify="space-between">
                    <Text fw={500} size="lg" c="#1d1d1f">{clinician.name}</Text>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#86868b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </Group>
                </UnstyledButton>
              ))}
            </Stack>
          </Stack>
        )}

        {/* Step 3: Subscribe */}
        {step === 'subscribe' && (
          <Stack gap="xl" style={{ flex: 1, justifyContent: 'center' }}>
            <Box ta="center">
              <Box
                style={{
                  width: 80,
                  height: 80,
                  backgroundColor: 'rgba(52, 199, 89, 0.1)',
                  borderRadius: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 24px',
                }}
              >
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#34c759" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </Box>
              <Text
                style={{
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  color: '#1d1d1f',
                  letterSpacing: '-0.025em',
                  marginBottom: 8,
                }}
              >
                {selectedClinician?.name}
              </Text>
              <Text style={{ fontSize: '1rem', color: '#86868b' }}>
                Your personal rota calendar is ready
              </Text>
            </Box>

            {subscribeInfoQuery.isLoading ? (
              <Box ta="center" py={40}>
                <Loader size="lg" color="#0071e3" />
              </Box>
            ) : subscribeInfoQuery.isError ? (
              <Box
                ta="center"
                p={24}
                style={{
                  backgroundColor: 'rgba(255, 59, 48, 0.1)',
                  borderRadius: 12,
                }}
              >
                <Text c="#ff3b30" fw={500}>
                  Failed to generate calendar link. Please try again.
                </Text>
              </Box>
            ) : (
              <Stack gap="md">
                <Button
                  size="xl"
                  fullWidth
                  onClick={handleSubscribe}
                  style={{
                    backgroundColor: '#0071e3',
                    borderRadius: 12,
                    height: 56,
                    fontSize: '1.125rem',
                    fontWeight: 600,
                  }}
                >
                  Add to Calendar
                </Button>

                <Box
                  p={16}
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: 12,
                    border: '1px solid rgba(0, 0, 0, 0.06)',
                  }}
                >
                  <Text size="sm" c="#86868b" mb={8}>
                    Or copy this URL to add manually:
                  </Text>
                  <Box
                    p={12}
                    style={{
                      backgroundColor: '#f5f5f7',
                      borderRadius: 8,
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      wordBreak: 'break-all',
                      color: '#1d1d1f',
                    }}
                  >
                    {subscribeInfoQuery.data?.icalUrl}
                  </Box>
                  <Button
                    variant="light"
                    fullWidth
                    mt={12}
                    onClick={() => {
                      navigator.clipboard.writeText(subscribeInfoQuery.data?.icalUrl || '');
                    }}
                    style={{
                      borderRadius: 8,
                    }}
                  >
                    Copy URL
                  </Button>
                </Box>

                <Box
                  p={16}
                  style={{
                    backgroundColor: 'rgba(0, 113, 227, 0.04)',
                    borderRadius: 12,
                  }}
                >
                  <Text size="sm" c="#1d1d1f" fw={500} mb={4}>
                    How it works
                  </Text>
                  <Text size="sm" c="#86868b">
                    Your calendar app will subscribe to this feed. It updates automatically,
                    so you will always see your latest rota, on-call shifts, and leave.
                  </Text>
                </Box>
              </Stack>
            )}
          </Stack>
        )}
      </Box>

      {/* Footer */}
      <Box p="md" ta="center">
        <Text size="xs" c="dimmed">
          Powered by Rotato
        </Text>
      </Box>
    </Box>
  );
};
