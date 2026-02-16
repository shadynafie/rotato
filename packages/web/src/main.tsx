import React from 'react';
import ReactDOM from 'react-dom/client';
import { MantineProvider, createTheme } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { CalendarPage } from './pages/CalendarPage';
import { CliniciansPage } from './pages/Settings/CliniciansPage';
import { DutiesPage } from './pages/Settings/DutiesPage';
import { JobPlansPage } from './pages/Settings/JobPlansPage';
import { LeavesPage } from './pages/Settings/LeavesPage';
import { OncallPage } from './pages/Settings/OncallPage';
import { OnCallSlotsPage } from './pages/Settings/OnCallSlotsPage';
import { ShareTokensPage } from './pages/Settings/ShareTokensPage';
import { UsersPage } from './pages/Settings/UsersPage';
import { CoveragePage } from './pages/Settings/CoveragePage';
import { PublicViewPage } from './pages/PublicViewPage';
import { MainLayout } from './layout/MainLayout';

import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import './styles/global.css';

const theme = createTheme({
  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif',
  primaryColor: 'blue',
  colors: {
    blue: [
      '#e7f5ff',
      '#d0ebff',
      '#a5d8ff',
      '#74c0fc',
      '#4dabf7',
      '#339af0',
      '#0071e3',
      '#0077ed',
      '#1971c2',
      '#1864ab',
    ],
  },
  radius: {
    xs: '6px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px',
  },
  shadows: {
    xs: '0 1px 2px rgba(0, 0, 0, 0.04)',
    sm: '0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.06)',
    md: '0 4px 6px rgba(0, 0, 0, 0.04), 0 2px 4px rgba(0, 0, 0, 0.06)',
    lg: '0 10px 25px rgba(0, 0, 0, 0.06), 0 5px 10px rgba(0, 0, 0, 0.04)',
    xl: '0 20px 40px rgba(0, 0, 0, 0.08), 0 10px 20px rgba(0, 0, 0, 0.06)',
  },
  defaultRadius: 'md',
  components: {
    Button: {
      defaultProps: {
        radius: 'md',
      },
      styles: {
        root: {
          fontWeight: 500,
          transition: 'all 150ms ease',
        },
      },
    },
    Card: {
      defaultProps: {
        radius: 'lg',
        shadow: 'sm',
      },
    },
    TextInput: {
      defaultProps: {
        radius: 'md',
      },
      styles: {
        input: {
          transition: 'border-color 150ms ease, box-shadow 150ms ease',
          '&:focus': {
            borderColor: '#0071e3',
            boxShadow: '0 0 0 3px rgba(0, 113, 227, 0.15)',
          },
        },
      },
    },
    PasswordInput: {
      defaultProps: {
        radius: 'md',
      },
    },
    Select: {
      defaultProps: {
        radius: 'md',
      },
    },
    Modal: {
      defaultProps: {
        radius: 'lg',
        centered: true,
      },
      styles: {
        content: {
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.12)',
        },
      },
    },
    Table: {
      styles: {
        table: {
          fontSize: '0.9375rem',
        },
        th: {
          fontWeight: 600,
          color: '#86868b',
          fontSize: '0.8125rem',
          textTransform: 'uppercase',
          letterSpacing: '0.02em',
        },
      },
    },
  },
});

const qc = new QueryClient();

const ProtectedPage: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute>
    <MainLayout>{children}</MainLayout>
  </ProtectedRoute>
);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <MantineProvider theme={theme}>
      <ModalsProvider>
        <Notifications position="top-right" />
        <QueryClientProvider client={qc}>
          <AuthProvider>
            <BrowserRouter>
              <Routes>
                {/* Public routes - no auth required */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/view/:token" element={<PublicViewPage />} />

                {/* Protected routes - auth required */}
                <Route path="/" element={<ProtectedPage><CalendarPage /></ProtectedPage>} />
                <Route path="/settings/clinicians" element={<ProtectedPage><CliniciansPage /></ProtectedPage>} />
                <Route path="/settings/duties" element={<ProtectedPage><DutiesPage /></ProtectedPage>} />
                <Route path="/settings/job-plans" element={<ProtectedPage><JobPlansPage /></ProtectedPage>} />
                <Route path="/settings/oncall" element={<ProtectedPage><OncallPage /></ProtectedPage>} />
                <Route path="/settings/oncall-slots" element={<ProtectedPage><OnCallSlotsPage /></ProtectedPage>} />
                <Route path="/settings/leaves" element={<ProtectedPage><LeavesPage /></ProtectedPage>} />
                <Route path="/settings/share-tokens" element={<ProtectedPage><ShareTokensPage /></ProtectedPage>} />
                <Route path="/settings/users" element={<ProtectedPage><UsersPage /></ProtectedPage>} />
                <Route path="/settings/coverage" element={<ProtectedPage><CoveragePage /></ProtectedPage>} />

                {/* Catch-all redirect */}
                <Route path="*" element={<ProtectedPage><CalendarPage /></ProtectedPage>} />
              </Routes>
            </BrowserRouter>
          </AuthProvider>
        </QueryClientProvider>
      </ModalsProvider>
    </MantineProvider>
  </React.StrictMode>
);
