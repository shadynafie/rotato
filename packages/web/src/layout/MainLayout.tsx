import { Badge, Box, Burger, Button, Divider, Group, Text, Transition, UnstyledButton } from '@mantine/core';
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

const navItems = [
  {
    label: 'Calendar',
    to: '/',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    )
  },
];

const settingsItems = [
  {
    label: 'Clinicians',
    to: '/settings/clinicians',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    )
  },
  {
    label: 'Duties',
    to: '/settings/duties',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14,2 14,8 20,8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10,9 9,9 8,9"/>
      </svg>
    )
  },
  {
    label: 'Job Plans',
    to: '/settings/job-plans',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"/>
        <rect x="14" y="3" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/>
        <rect x="3" y="14" width="7" height="7"/>
      </svg>
    )
  },
  {
    label: 'On-call Rota',
    to: '/settings/oncall',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
      </svg>
    )
  },
  {
    label: 'Leave',
    to: '/settings/leaves',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
        <path d="M8 14h.01"/>
        <path d="M12 14h.01"/>
        <path d="M16 14h.01"/>
        <path d="M8 18h.01"/>
        <path d="M12 18h.01"/>
      </svg>
    )
  },
  {
    label: 'Coverage',
    to: '/settings/coverage',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="8.5" cy="7" r="4"/>
        <path d="M20 8v6"/>
        <path d="M23 11h-6"/>
      </svg>
    )
  },
  {
    label: 'Share Links',
    to: '/settings/share-tokens',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="5" r="3"/>
        <circle cx="6" cy="12" r="3"/>
        <circle cx="18" cy="19" r="3"/>
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
      </svg>
    )
  },
  {
    label: 'Users',
    to: '/settings/users',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    )
  },
];

interface NavItemProps {
  label: string;
  to: string;
  icon: React.ReactNode;
  active: boolean;
  onClick?: () => void;
  badge?: number;
}

const NavItem: React.FC<NavItemProps> = ({ label, to, icon, active, onClick, badge }) => (
  <UnstyledButton
    component={Link}
    to={to}
    onClick={onClick}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '10px 14px',
      borderRadius: '10px',
      color: active ? '#0071e3' : '#1d1d1f',
      backgroundColor: active ? 'rgba(0, 113, 227, 0.08)' : 'transparent',
      fontWeight: active ? 500 : 400,
      fontSize: '0.9375rem',
      transition: 'all 150ms ease',
      textDecoration: 'none',
      width: '100%',
    }}
    onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => {
      if (!active) {
        e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.04)';
      }
    }}
    onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => {
      if (!active) {
        e.currentTarget.style.backgroundColor = 'transparent';
      }
    }}
  >
    <span style={{ opacity: active ? 1 : 0.7, display: 'flex', alignItems: 'center' }}>{icon}</span>
    <span style={{ flex: 1 }}>{label}</span>
    {badge !== undefined && badge > 0 && (
      <Badge size="sm" variant="filled" color="red" radius="xl">
        {badge} pending
      </Badge>
    )}
  </UnstyledButton>
);

export const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { logout } = useAuth();

  // Fetch pending coverage count for badge
  const { data: pendingData } = useQuery({
    queryKey: ['coverage-pending-count'],
    queryFn: async () => {
      const res = await api.get<{ count: number }>('/api/coverage/pending-count');
      return res.data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });
  const pendingCoverageCount = pendingData?.count ?? 0;

  const sidebarContent = (
    <>
      {/* Logo */}
      <Box px="md" py="lg">
        <Group gap="sm">
          <img src="/icon-192.png" alt="Rotato" width={36} height={36} style={{ borderRadius: 8 }} />
          <Text
            style={{
              fontSize: '1.35rem',
              fontWeight: 700,
              color: '#0051a8',
              letterSpacing: '-0.02em'
            }}
          >
            Rotato
          </Text>
        </Group>
      </Box>

      {/* Main nav */}
      <Box px="sm">
        {navItems.map((item) => (
          <NavItem
            key={item.to}
            {...item}
            active={location.pathname === item.to}
            onClick={() => setMobileOpen(false)}
          />
        ))}
      </Box>

      <Divider my="md" mx="md" color="rgba(0,0,0,0.06)" />

      {/* Settings section */}
      <Box px="md" mb="xs">
        <Text size="xs" c="dimmed" fw={600} tt="uppercase" style={{ letterSpacing: '0.04em' }}>
          Settings
        </Text>
      </Box>
      <Box px="sm">
        {settingsItems.map((item) => (
          <NavItem
            key={item.to}
            {...item}
            active={location.pathname === item.to}
            onClick={() => setMobileOpen(false)}
            badge={item.to === '/settings/coverage' ? pendingCoverageCount : undefined}
          />
        ))}
      </Box>

      {/* Spacer */}
      <Box style={{ flex: 1 }} />

      {/* Logout */}
      <Box p="md">
        <Button
          variant="subtle"
          color="gray"
          fullWidth
          onClick={logout}
          leftSection={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          }
          styles={{
            root: {
              justifyContent: 'flex-start',
              color: '#86868b',
              fontWeight: 400,
            }
          }}
        >
          Sign out
        </Button>
      </Box>
    </>
  );

  return (
    <Box style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Desktop Sidebar */}
      <Box
        component="nav"
        visibleFrom="sm"
        style={{
          width: 260,
          backgroundColor: '#ffffff',
          borderRight: '1px solid rgba(0, 0, 0, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 100,
        }}
      >
        {sidebarContent}
      </Box>

      {/* Mobile Header */}
      <Box
        hiddenFrom="sm"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 60,
          backgroundColor: 'rgba(255, 255, 255, 0.72)',
          backdropFilter: 'saturate(180%) blur(20px)',
          WebkitBackdropFilter: 'saturate(180%) blur(20px)',
          borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
          zIndex: 200,
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
        }}
      >
        <Group justify="space-between" w="100%">
          <Burger opened={mobileOpen} onClick={() => setMobileOpen(!mobileOpen)} size="sm" />
          <Group gap={8}>
            <img src="/icon-192.png" alt="Rotato" width={28} height={28} style={{ borderRadius: 6 }} />
            <Text fw={700} style={{ letterSpacing: '-0.02em', color: '#0051a8' }}>Rotato</Text>
          </Group>
          <Box w={28} /> {/* Spacer for centering */}
        </Group>
      </Box>

      {/* Mobile Sidebar Overlay */}
      <Transition mounted={mobileOpen} transition="slide-right" duration={200}>
        {(styles) => (
          <>
            <Box
              hiddenFrom="sm"
              onClick={() => setMobileOpen(false)}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                zIndex: 199,
              }}
            />
            <Box
              hiddenFrom="sm"
              style={{
                ...styles,
                position: 'fixed',
                top: 0,
                left: 0,
                bottom: 0,
                width: 280,
                backgroundColor: '#ffffff',
                zIndex: 201,
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)',
              }}
            >
              {sidebarContent}
            </Box>
          </>
        )}
      </Transition>

      {/* Main Content */}
      <Box
        component="main"
        style={{
          flex: 1,
          minHeight: '100vh',
          backgroundColor: '#f5f5f7',
        }}
        ml={{ base: 0, sm: 260 }}
        pt={{ base: 60, sm: 0 }}
      >
        <Box p={{ base: 'md', sm: 'xl' }} maw={1200} mx="auto">
          {children}
        </Box>
      </Box>
    </Box>
  );
};
