import { ActionIcon, Badge, Box, Button, Group, Loader, Stack, Table, Text, Tooltip, Accordion } from '@mantine/core';
import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';

type ShareToken = { id: number; token: string; active: boolean; createdAt: string; description?: string | null };
type Clinician = { id: number; name: string; role: string };

const fetchTokens = async () => {
  const res = await api.get<ShareToken[]>('/api/share-tokens');
  return res.data;
};

const fetchClinicians = async () => {
  const res = await api.get<Clinician[]>('/api/clinicians');
  return res.data;
};

// Copy to clipboard with fallback for non-HTTPS contexts
async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to fallback
    }
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  textArea.style.top = '-999999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    document.execCommand('copy');
    return true;
  } catch {
    return false;
  } finally {
    textArea.remove();
  }
}

// Copy button component
function CopyButton({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const success = await copyToClipboard(url);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Tooltip label={copied ? 'Copied!' : label} withArrow>
      <ActionIcon
        variant="light"
        color={copied ? 'green' : 'blue'}
        onClick={handleCopy}
        radius="md"
        size="lg"
      >
        {copied ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        )}
      </ActionIcon>
    </Tooltip>
  );
}

// Calendar icon
const CalendarIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);

export const ShareTokensPage: React.FC = () => {
  const qc = useQueryClient();
  const tokensQuery = useQuery({ queryKey: ['shareTokens'], queryFn: fetchTokens });
  const cliniciansQuery = useQuery({ queryKey: ['clinicians'], queryFn: fetchClinicians });
  const createMutation = useMutation({
    mutationFn: async () => api.post('/api/share-tokens'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shareTokens'] })
  });

  // Get the most recent active token (sorted by createdAt desc from API)
  const activeToken = tokensQuery.data?.find(t => t.active);
  const baseUrl = window.location.origin;

  const getIcalUrl = (clinicianId?: number) => {
    if (!activeToken) return '';
    const base = `${baseUrl}/public/${activeToken.token}/ical`;
    return clinicianId ? `${base}?clinician=${clinicianId}` : base;
  };

  const getViewUrl = () => {
    if (!activeToken) return '';
    return `${baseUrl}/view/${activeToken.token}`;
  };

  const isLoading = tokensQuery.isLoading || cliniciansQuery.isLoading;

  return (
    <Box>
      {/* Page Header */}
      <Box mb={32}>
        <Text
          style={{
            fontSize: '2rem',
            fontWeight: 700,
            color: '#1d1d1f',
            letterSpacing: '-0.025em',
            marginBottom: 8,
          }}
        >
          Share Links
        </Text>
        <Text style={{ fontSize: '1.0625rem', color: '#86868b' }}>
          Share calendar links with your team to sync with Google Calendar, Outlook, or Apple Calendar
        </Text>
      </Box>

      {isLoading && (
        <Box ta="center" py={60}>
          <Loader size="lg" color="#0071e3" />
        </Box>
      )}

      {!isLoading && !activeToken && (
        <Box
          ta="center"
          py={60}
          style={{
            backgroundColor: '#ffffff',
            borderRadius: 16,
            border: '1px solid rgba(0, 0, 0, 0.06)',
          }}
        >
          <Box
            style={{
              width: 64,
              height: 64,
              backgroundColor: '#f5f5f7',
              borderRadius: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#86868b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3"/>
              <circle cx="6" cy="12" r="3"/>
              <circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
          </Box>
          <Text fw={500} c="#1d1d1f" mb={4}>No share token created</Text>
          <Text c="dimmed" size="sm" mb={16}>Create a token to enable calendar sharing</Text>
          <Button
            onClick={() => createMutation.mutate()}
            loading={createMutation.isPending}
            leftSection={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            }
          >
            Create Share Token
          </Button>
        </Box>
      )}

      {!isLoading && activeToken && (
        <Stack gap="lg">
          {/* Individual Clinician Calendars */}
          <Box
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 16,
              border: '1px solid rgba(0, 0, 0, 0.06)',
              overflow: 'hidden',
            }}
          >
            <Box p="lg" style={{ borderBottom: '1px solid rgba(0, 0, 0, 0.06)' }}>
              <Text fw={600} c="#1d1d1f" size="lg">Individual Calendars</Text>
              <Text size="sm" c="dimmed">Each clinician can subscribe to their own schedule</Text>
            </Box>
            <Table verticalSpacing="md" horizontalSpacing="lg">
              <Table.Tbody>
                {cliniciansQuery.data?.map((clinician) => (
                  <Table.Tr key={clinician.id}>
                    <Table.Td>
                      <Group gap="sm">
                        <Box
                          style={{
                            width: 36,
                            height: 36,
                            backgroundColor: clinician.role === 'consultant' ? '#e3f2fd' : '#f3e5f5',
                            borderRadius: 8,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <CalendarIcon />
                        </Box>
                        <Box>
                          <Text fw={500} c="#1d1d1f">{clinician.name}</Text>
                          <Text size="xs" c="dimmed" tt="capitalize">{clinician.role}</Text>
                        </Box>
                      </Group>
                    </Table.Td>
                    <Table.Td style={{ width: 120 }}>
                      <Group gap="xs" justify="flex-end">
                        <CopyButton url={getIcalUrl(clinician.id)} label="Copy iCal link" />
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Box>

          {/* Team Calendar */}
          <Box
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 16,
              border: '1px solid rgba(0, 0, 0, 0.06)',
              padding: 24,
            }}
          >
            <Group justify="space-between">
              <Box>
                <Text fw={600} c="#1d1d1f" size="lg">Team Calendar</Text>
                <Text size="sm" c="dimmed">Full team schedule - all clinicians in one calendar</Text>
              </Box>
              <Group gap="xs">
                <CopyButton url={getIcalUrl()} label="Copy team iCal link" />
              </Group>
            </Group>
          </Box>

          {/* Web View Link */}
          <Box
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 16,
              border: '1px solid rgba(0, 0, 0, 0.06)',
              padding: 24,
            }}
          >
            <Group justify="space-between">
              <Box>
                <Text fw={600} c="#1d1d1f" size="lg">Web View</Text>
                <Text size="sm" c="dimmed">Read-only web page to view the rota (no login required)</Text>
              </Box>
              <Group gap="xs">
                <CopyButton url={getViewUrl()} label="Copy web view link" />
              </Group>
            </Group>
          </Box>

          {/* Instructions */}
          <Box
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 16,
              border: '1px solid rgba(0, 0, 0, 0.06)',
              overflow: 'hidden',
            }}
          >
            <Accordion variant="contained" styles={{ item: { border: 'none' }, control: { padding: '16px 24px' }, panel: { padding: '0 24px 24px' } }}>
              <Accordion.Item value="instructions">
                <Accordion.Control>
                  <Text fw={600} c="#1d1d1f">How to Subscribe to a Calendar</Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="md">
                    <Box>
                      <Text fw={500} c="#1d1d1f" mb={4}>Google Calendar</Text>
                      <Text size="sm" c="dimmed">
                        1. Open Google Calendar on your computer<br/>
                        2. Click the + next to "Other calendars"<br/>
                        3. Select "From URL"<br/>
                        4. Paste the iCal link and click "Add calendar"
                      </Text>
                    </Box>
                    <Box>
                      <Text fw={500} c="#1d1d1f" mb={4}>Outlook</Text>
                      <Text size="sm" c="dimmed">
                        1. Go to calendar.live.com or open Outlook<br/>
                        2. Click "Add calendar" → "Subscribe from web"<br/>
                        3. Paste the iCal link and give it a name<br/>
                        4. Click "Import"
                      </Text>
                    </Box>
                    <Box>
                      <Text fw={500} c="#1d1d1f" mb={4}>Apple Calendar (Mac/iPhone)</Text>
                      <Text size="sm" c="dimmed">
                        1. Open Calendar app<br/>
                        2. File → New Calendar Subscription (Mac) or Add Calendar → Add Subscription Calendar (iPhone)<br/>
                        3. Paste the iCal link<br/>
                        4. Click Subscribe
                      </Text>
                    </Box>
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          </Box>

          {/* Token Status */}
          <Box
            style={{
              backgroundColor: '#f5f5f7',
              borderRadius: 12,
              padding: 16,
            }}
          >
            <Group justify="space-between">
              <Group gap="sm">
                <Badge variant="light" color="green" radius="md">Active</Badge>
                <Text size="sm" c="dimmed">Share token is active</Text>
              </Group>
              <Button
                variant="subtle"
                color="gray"
                size="xs"
                onClick={() => createMutation.mutate()}
                loading={createMutation.isPending}
              >
                Generate New Token
              </Button>
            </Group>
          </Box>
        </Stack>
      )}
    </Box>
  );
};
