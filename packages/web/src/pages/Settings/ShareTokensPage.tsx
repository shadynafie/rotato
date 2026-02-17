import { ActionIcon, Badge, Box, Button, Group, Stack, Table, Text, Tooltip, Accordion } from '@mantine/core';
import { notify } from '../../utils/notify';
import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import {
  PageHeader,
  LoadingSpinner,
  EmptyState,
  CalendarIcon,
  CheckIcon,
  CopyIcon,
  AddIcon,
  ShareIcon,
} from '../../components';

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
          <CheckIcon size={18} />
        ) : (
          <CopyIcon size={18} />
        )}
      </ActionIcon>
    </Tooltip>
  );
}

export const ShareTokensPage: React.FC = () => {
  const qc = useQueryClient();
  const tokensQuery = useQuery({ queryKey: ['shareTokens'], queryFn: fetchTokens });
  const cliniciansQuery = useQuery({ queryKey: ['clinicians'], queryFn: fetchClinicians });
  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<ShareToken>('/api/share-tokens');
      return res.data;
    },
    onSuccess: (newToken) => {
      qc.invalidateQueries({ queryKey: ['shareTokens'] });
      notify.show({
        title: 'New token generated',
        message: `Token created: ${newToken.token.slice(0, 8)}... All previous tokens have been deleted.`,
        color: 'green',
        autoClose: 5000,
      });
    }
  });

  // Get the token (there's only one since we delete all others when creating)
  const activeToken = tokensQuery.data?.[0];
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
      <PageHeader
        title="Share Links"
        subtitle="Share calendar links with your team to sync with Google Calendar, Outlook, or Apple Calendar"
      />

      {isLoading && <LoadingSpinner />}

      {!isLoading && !activeToken && (
        <EmptyState
          icon={<ShareIcon size={28} color="#86868b" strokeWidth={1.5} />}
          title="No share token created"
          message="Create a token to enable calendar sharing"
          action={
            <Button
              onClick={() => createMutation.mutate()}
              loading={createMutation.isPending}
              leftSection={<AddIcon />}
            >
              Create Share Token
            </Button>
          }
        />
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
                          <CalendarIcon size={18} />
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
                <Text size="sm" c="dimmed">
                  Share token is active, generated {new Date(activeToken.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </Text>
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
