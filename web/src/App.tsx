import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Permission } from '@pbms/shared';
import { useAuth } from './lib/auth';
import { AppLayout } from './layouts/AppLayout';
import { Empty, Spinner } from './components/ui';
import { LoginPage } from './pages/Login';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Customers = lazy(() => import('./pages/Customers'));
const CustomerDetail = lazy(() => import('./pages/CustomerDetail'));
const Orders = lazy(() => import('./pages/Orders'));
const OrderNew = lazy(() => import('./pages/OrderNew'));
const OrderDetail = lazy(() => import('./pages/OrderDetail'));
const Sales = lazy(() => import('./pages/Sales'));
const Payments = lazy(() => import('./pages/Payments'));
const Outstanding = lazy(() => import('./pages/Outstanding'));
const Expenses = lazy(() => import('./pages/Expenses'));
const ModuleList = lazy(() => import('./pages/ModuleList'));
const ModuleForm = lazy(() => import('./pages/ModuleForm'));
const ModuleDetail = lazy(() => import('./pages/ModuleDetail'));
const Colleges = lazy(() => import('./pages/Colleges'));
const Conferences = lazy(() => import('./pages/Conferences'));
const ConferenceDetail = lazy(() => import('./pages/ConferenceDetail'));
const CollegeDetail = lazy(() => import('./pages/CollegeDetail'));
const Employees = lazy(() => import('./pages/Employees'));
const Services = lazy(() => import('./pages/Services'));
const ReportCenter = lazy(() => import('./pages/ReportCenter'));
const DailyReport = lazy(() => import('./pages/DailyReport'));
const MonthlyReport = lazy(() => import('./pages/MonthlyReport'));
const RangeReport = lazy(() => import('./pages/RangeReport'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Performance = lazy(() => import('./pages/Performance'));
const Notifications = lazy(() => import('./pages/Notifications'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const Profile = lazy(() => import('./pages/Profile'));
const InvoiceView = lazy(() => import('./pages/InvoiceView'));

function Protected({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();
  if (loading || (user && !profile)) return <Spinner label="Signing you in…" />;
  if (!user || !profile) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function Guard({ perms, children }: { perms: Permission[]; children: ReactNode }) {
  const { can } = useAuth();
  if (!can(...perms)) return <Empty title="Access restricted" message="You do not have permission to open this page. Contact the administrator if you need access." />;
  return <>{children}</>;
}

function Home() {
  const { can } = useAuth();
  return can('dashboard.view') ? <Dashboard /> : <Navigate to="/orders" replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/invoices/:id" element={<Protected><Suspense fallback={<Spinner />}><InvoiceView /></Suspense></Protected>} />
      <Route
        element={
          <Protected>
            <AppLayout />
          </Protected>
        }
      >
        <Route
          path="*"
          element={
            <Suspense fallback={<Spinner />}>
              <Routes>
                <Route index element={<Home />} />
                <Route path="customers" element={<Customers />} />
                <Route path="customers/:id" element={<CustomerDetail />} />
                <Route path="orders" element={<Orders />} />
                <Route path="orders/new" element={<Guard perms={['orders.create']}><OrderNew /></Guard>} />
                <Route path="orders/:id" element={<OrderDetail />} />
                <Route path="sales" element={<Sales />} />
                <Route path="payments" element={<Payments />} />
                <Route path="outstanding" element={<Outstanding />} />
                <Route path="expenses" element={<Guard perms={['expenses.create', 'expenses.view_all']}><Expenses /></Guard>} />
                <Route path="m/:moduleKey" element={<ModuleList />} />
                <Route path="m/:moduleKey/new" element={<Guard perms={['orders.create']}><ModuleForm /></Guard>} />
                <Route path="m/:moduleKey/:id" element={<ModuleDetail />} />
                <Route path="m/:moduleKey/:id/edit" element={<Guard perms={['orders.edit']}><ModuleForm /></Guard>} />
                <Route path="conferences" element={<Conferences />} />
                <Route path="conferences/:id" element={<ConferenceDetail />} />
                <Route path="colleges" element={<Guard perms={['colleges.view', 'colleges.manage']}><Colleges /></Guard>} />
                <Route path="colleges/:id" element={<Guard perms={['colleges.view', 'colleges.manage']}><CollegeDetail /></Guard>} />
                <Route path="employees" element={<Guard perms={['employees.view', 'employees.manage']}><Employees /></Guard>} />
                <Route path="services" element={<Guard perms={['services.manage']}><Services /></Guard>} />
                <Route path="reports" element={<Guard perms={['reports.view']}><ReportCenter /></Guard>} />
                <Route path="reports/daily" element={<Guard perms={['reports.view']}><DailyReport /></Guard>} />
                <Route path="reports/monthly" element={<Guard perms={['reports.view']}><MonthlyReport /></Guard>} />
                <Route path="reports/range" element={<Guard perms={['reports.view']}><RangeReport /></Guard>} />
                <Route path="analytics" element={<Guard perms={['analytics.view']}><Analytics /></Guard>} />
                <Route path="performance" element={<Performance />} />
                <Route path="notifications" element={<Notifications />} />
                <Route path="audit-logs" element={<Guard perms={['audit.view']}><AuditLogs /></Guard>} />
                <Route path="settings" element={<Guard perms={['settings.manage', 'roles.manage', 'backup.manage']}><SettingsPage /></Guard>} />
                <Route path="profile" element={<Profile />} />
                <Route path="*" element={<Empty title="Page not found" message="The page you are looking for does not exist." />} />
              </Routes>
            </Suspense>
          }
        />
      </Route>
    </Routes>
  );
}
