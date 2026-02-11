import { ActionIcon, Badge, Box, Button, Group, Loader, Table, Text, Tooltip } from '@mantine/core';
import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';

type ShareToken = { id: number; token: string; active: boolean; createdAt: string; description?: string | null };

const fetchTokens = async () => {
  const res = await api.get<ShareToken[]>('/api/share-tokens');
  return res.data;
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Copy to clipboard with fallback for non-HTTPS contexts
async function copyToClipboard(text: string): Promise<boolean> {
  // Try modern clipboard API first
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback for HTTP contexts
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

// Custom copy button with fallback support
function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const success = await copyToClipboard(url);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Tooltip label={copied ? 'Copied!' : 'Copy link'} withArrow>
      <ActionIcon
        variant="light"
        color={copied ? 'green' : 'blue'}
        onClick={handleCopy}
        radius="md"
      >
        {copied ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        )}
      </ActionIcon>
    </Tooltip>
  );
}

export const ShareTokensPage: React.FC = () => {
  const qc = useQueryClient();
  const listQuery = useQuery({ queryKey: ['shareTokens'], queryFn: fetchTokens });
  const createMutation = useMutation({
    mutationFn: async () => api.post('/api/share-tokens'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shareTokens'] })
  });

  return (
    <Box>
      {/* Page Header */}
      <Group justify="space-between" mb={32}>
        <Box>
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
            Generate shareable links for read-only rota access
          </Text>
        </Box>
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
          Create New Link
        </Button>
      </Group>

      {/* Loading State */}
      {listQuery.isLoading && (
        <Box ta="center" py={60}>
          <Loader size="lg" color="#0071e3" />
          <Text mt="md" c="dimmed">Loading share tokens...</Text>
        </Box>
      )}

      {/* Table */}
      {listQuery.data && listQuery.data.length > 0 && (
        <Box
          style={{
            backgroundColor: '#ffffff',
            borderRadius: 16,
            overflow: 'hidden',
            border: '1px solid rgba(0, 0, 0, 0.06)',
          }}
        >
          <Table verticalSpacing="md" horizontalSpacing="lg">
            <Table.Thead>
              <Table.Tr style={{ backgroundColor: '#fafafa' }}>
                <Table.Th>Token</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Created</Table.Th>
                <Table.Th style={{ width: 100 }}>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {listQuery.data.map((t) => {
                const shareUrl = `${window.location.origin}/view/${t.token}`;
                return (
                  <Table.Tr key={t.id}>
                    <Table.Td>
                      <Group gap="xs">
                        <Box
                          style={{
                            backgroundColor: '#f5f5f7',
                            borderRadius: 8,
                            padding: '8px 12px',
                            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                            fontSize: '0.875rem',
                            color: '#1d1d1f',
                            maxWidth: 280,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {t.token}
                        </Box>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        variant="light"
                        color={t.active ? 'green' : 'gray'}
                        radius="md"
                      >
                        {t.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text c="#1d1d1f" size="sm">{formatDate(t.createdAt)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <CopyLinkButton url={shareUrl} />
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Box>
      )}

      {/* Empty State */}
      {listQuery.data && listQuery.data.length === 0 && (
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
          <Text fw={500} c="#1d1d1f" mb={4}>No share links created</Text>
          <Text c="dimmed" size="sm" mb={16}>Create a link to share your rota with others</Text>
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
            Create Your First Link
          </Button>
        </Box>
      )}
    </Box>
  );
};
