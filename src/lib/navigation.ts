import type { LucideIcon } from "lucide-react";
import {
  Home,
  ClipboardList,
  Store,
  Boxes,
  Factory,
  FileSpreadsheet,
  Receipt,
  Users,
  MapPin,
  Package,
  BookImage,
  Barcode,
  GraduationCap,
  UserCog,
  Settings,
  BarChart3,
  BookOpenText,
  Trophy,
  ShieldAlert,
  Inbox,
  Scale,
  CalendarClock,
} from "lucide-react";

export interface NavLeaf {
  kind: "leaf";
  to: string;
  label: string;
  icon: LucideIcon;
}

export interface NavParent {
  kind: "parent";
  /** If set, clicking the label navigates here; if omitted, the label only toggles expand/collapse. */
  to?: string;
  label: string;
  icon: LucideIcon;
  children: NavLeaf[];
}

export interface NavSectionLabel {
  kind: "section";
  label: string;
}

export type NavEntry = NavLeaf | NavParent | NavSectionLabel;

export const NAV_ENTRIES: NavEntry[] = [
  { kind: "leaf", to: "/", label: "Home", icon: Home },
  {
    kind: "parent",
    to: "/purchase-orders",
    label: "Purchase Orders",
    icon: ClipboardList,
    children: [
      { kind: "leaf", to: "/retailers", label: "Accounts", icon: Store },
      { kind: "leaf", to: "/production", label: "Manufacturers", icon: Factory },
      { kind: "leaf", to: "/production/planner", label: "Planner & Simulator", icon: CalendarClock },
      { kind: "leaf", to: "/imports", label: "CSV Import", icon: FileSpreadsheet },
    ],
  },
  { kind: "leaf", to: "/pending-queue", label: "Pending Queue", icon: Inbox },
  { kind: "leaf", to: "/compliance", label: "Compliance", icon: Scale },
  { kind: "leaf", to: "/alerts", label: "Alerts", icon: ShieldAlert },
  { kind: "leaf", to: "/invoices", label: "Invoices", icon: Receipt },
  {
    kind: "parent",
    label: "Customers",
    icon: Users,
    children: [
      { kind: "leaf", to: "/retailers", label: "Accounts", icon: Store },
      { kind: "leaf", to: "/locations", label: "Locations", icon: MapPin },
    ],
  },
  {
    kind: "parent",
    to: "/products",
    label: "Products",
    icon: Package,
    children: [
      { kind: "leaf", to: "/inventory", label: "Inventory", icon: Boxes },
      { kind: "leaf", to: "/lookbook-templates", label: "Lookbooks", icon: BookImage },
      { kind: "leaf", to: "/barcodes", label: "Barcodes", icon: Barcode },
    ],
  },
  { kind: "section", label: "Admin" },
  { kind: "leaf", to: "/training", label: "Training", icon: GraduationCap },
  { kind: "leaf", to: "/people", label: "People", icon: UserCog },
  { kind: "leaf", to: "/settings", label: "Settings", icon: Settings },
  { kind: "leaf", to: "/reports", label: "Reports", icon: BarChart3 },
  { kind: "leaf", to: "/sops", label: "SOPs", icon: BookOpenText },
  { kind: "leaf", to: "/wins", label: "Wins", icon: Trophy },
];
