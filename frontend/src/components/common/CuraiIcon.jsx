import React from 'react';
import {
  Activity, Archive, ArrowDownLeft, ArrowUpRight, Bell, BookOpen, BriefcaseBusiness,
  CalendarDays, CalendarClock, ChartColumn, ChartNoAxesCombined, ChartPie,
  Check, CircleCheck, ClipboardList, ContactRound, DoorOpen, FolderOpen,
  Funnel, HeartPulse, HelpCircle, ListTodo, LogOut, Mail, Maximize2, Menu,
  MessageSquare, Minimize2, Package, PanelLeftClose, PanelLeftOpen, Plus,
  Search, Settings, ShieldCheck, SlidersHorizontal, Stethoscope, Tag, UsersRound,
  UserRound, Wallet, Pencil, KeyRound, ChevronDown, X, Paperclip, FileText, FileInput, Play, Pause, LockKeyhole, Trash2, Clock3, ArrowRight, ArrowLeft, PanelsTopLeft,
} from 'lucide-react';

const icons = {
  menu: Menu, expand: PanelLeftOpen, collapse: PanelLeftClose, search: Search,
  help: HelpCircle, notifications: Bell, logout: LogOut, plus: Plus,
  fullscreen: Maximize2, closeFullscreen: Minimize2, chevron: ChevronDown,
  calendar: CalendarDays, patients: UsersRound, broadcast: Mail,
  statistics: ChartNoAxesCombined, doctors: Stethoscope, 'doctor-schedule': CalendarClock,
  directory: BookOpen, 'service-prices': Tag, rooms: DoorOpen, 'room-management': DoorOpen,
  specialties: HeartPulse, laboratories: Activity, 'lab-price-statistics': ChartColumn,
  'payment-types': Wallet, loyalty: CircleCheck, 'staff-management': BriefcaseBusiness,
  settings: Settings, 'hms-reports': ClipboardList, 'services-report': ClipboardList,
  'treatment-statistics': ChartPie, 'doctor-statistics': ChartColumn,
  'quality-assessment': ShieldCheck, warehouse: Package,
  'crm-dashboard': ChartNoAxesCombined, 'crm-leads': ContactRound,
  'crm-tasks': ListTodo, 'crm-clients': UsersRound, 'crm-deals': BriefcaseBusiness,
  'crm-contacts': ContactRound, 'crm-acquisition': ChartColumn, 'crm-directory': BookOpen,
  'crm-task-statuses': CircleCheck, 'crm-telephony': MessageSquare, 'crm-funnel': Funnel,
  'crm-sources': SlidersHorizontal, 'finance-dashboard': ChartNoAxesCombined,
  'finance-income': ArrowDownLeft, 'finance-expenses': ArrowUpRight,
  'finance-salaries': Wallet, 'finance-reports': ClipboardList,
  materials: Package, deleted: Archive, attention: ShieldCheck, inventory: ClipboardList,
  'warehouse-materials': Package, 'warehouse-deleted': Archive,
  'warehouse-attention': ShieldCheck, 'warehouse-inventory': ClipboardList,
  edit: Pencil, key: KeyRound, permissions: ShieldCheck, check: Check, person: UserRound, close: X, paperclip: Paperclip, file: FileText, 'save-file': FileInput,
  play: Play, pause: Pause, lock: LockKeyhole, delete: Trash2, clock: Clock3, 'arrow-right': ArrowRight, 'arrow-left': ArrowLeft, 'crm-card': PanelsTopLeft,
};

export default function CuraiIcon({ name, className = '', ...props }) {
  const Icon = icons[name] || FolderOpen;
  return <Icon aria-hidden="true" className={`curai-icon ${className}`} strokeWidth={1.75} {...props} />;
}
