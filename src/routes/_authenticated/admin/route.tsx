import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: ({ context }) => {
    if (context.role !== "agency_admin") throw redirect({ to: "/portal" });
  },
  component: () => <Outlet />,
});
