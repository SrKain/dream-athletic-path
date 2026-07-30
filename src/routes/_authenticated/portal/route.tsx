import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/portal")({
  beforeLoad: ({ context }) => {
    if (context.role === "agency_admin") throw redirect({ to: "/admin" });
  },
  component: () => <Outlet />,
});
