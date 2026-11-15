export type PortalRole = "student" | "counselor";
const configured = import.meta.env.VITE_PORTAL_ID;
export const portalRole: PortalRole | undefined =
  configured === "student" || configured === "counselor"
    ? configured
    : undefined;
