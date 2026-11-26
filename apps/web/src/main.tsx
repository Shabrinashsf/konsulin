import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import { ApiError } from "./lib/api";
import { AuthProvider } from "./lib/auth";
import { ToastProvider } from "./components/ui";
import { AppShell, RoleRoute } from "./components/layout";
import { LoginPage, RegisterPage } from "./routes/auth";
import { HomePage } from "./routes/home";
import { CalendarPage } from "./routes/calendar";
import { ProjectsPage } from "./routes/projects";
import { ProjectDetailPage } from "./routes/project-detail";
import { ConsultationDetailPage } from "./routes/consultation-detail";
import { FolderDetailPage } from "./routes/folder-detail";
import { InvitationsPage } from "./routes/invitations";
import { SchedulePage } from "./routes/schedule";
import { MonitoringPage } from "./routes/monitoring";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2,
    },
  },
});

const Providers = () => (
  <ToastProvider>
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  </ToastProvider>
);

const router = createBrowserRouter([
  {
    element: <Providers />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/register", element: <RegisterPage /> },
      {
        element: <AppShell />,
        children: [
          { index: true, element: <HomePage /> },
          { path: "kalender", element: <CalendarPage /> },
          { path: "projects", element: <ProjectsPage /> },
          { path: "projects/:projectId", element: <ProjectDetailPage /> },
          { path: "consultations/:id", element: <ConsultationDetailPage /> },
          { path: "folders/:folderId", element: <FolderDetailPage /> },
          // the E1 email button points at /invitations (notification templates)
          { path: "invitations", element: <Navigate to="/undangan" replace /> },
          {
            element: <RoleRoute role="student" />,
            children: [{ path: "undangan", element: <InvitationsPage /> }],
          },
          {
            element: <RoleRoute role="lecturer" />,
            children: [
              { path: "jadwal", element: <SchedulePage /> },
              { path: "monitoring", element: <MonitoringPage /> },
            ],
          },
          { path: "*", element: <HomePage /> },
        ],
      },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
