import {
  AppWindow,
  Archive,
  Box,
  Boxes,
  BrickWall,
  Circle,
  Clock,
  Cloud,
  Component,
  Container,
  Cpu,
  Database,
  DoorOpen,
  FileText,
  Folder,
  Globe,
  HardDrive,
  Monitor,
  Network,
  Puzzle,
  Radio,
  Rows3,
  Search,
  Server,
  Ship,
  Signpost,
  Smartphone,
  Split,
  SquareDashed,
  SquareFunction,
  StickyNote,
  Table2,
  Type,
  User,
  Warehouse,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { ShapeId } from './shapes.ts'

const ICONS: Partial<Record<ShapeId, LucideIcon>> = {
  text: Type,
  table: Table2,
  service: Server,
  database: Database,
  queue: Rows3,
  cache: Zap,
  user: User,
  'external-system': Cloud,
  document: FileText,
  boundary: SquareDashed,
  'load-balancer': Split,
  'api-gateway': DoorOpen,
  cdn: Network,
  server: HardDrive,
  container: Container,
  'kubernetes-cluster': Ship,
  firewall: BrickWall,
  dns: Signpost,
  'object-storage': Archive,
  'search-index': Search,
  'data-warehouse': Warehouse,
  'event-topic': Radio,
  scheduler: Clock,
  function: SquareFunction,
  browser: AppWindow,
  'mobile-app': Smartphone,
  'desktop-app': Monitor,
  'iot-device': Cpu,
  'uml-component': Puzzle,
  'uml-interface': Circle,
  'uml-package': Folder,
  'uml-note': StickyNote,
  'c4-person': User,
  'c4-system': Box,
  'c4-container': Boxes,
  'c4-component': Component,
  'c4-database': Database,
  'c4-external-system': Globe,
  'c4-boundary': SquareDashed,
}

/** Icon of a palette shape: a lucide icon, or the outline of a basic shape. */
export function ShapeIcon({ shape }: { shape: ShapeId }) {
  const Icon = ICONS[shape]
  if (Icon) return <Icon aria-hidden />
  return (
    <svg aria-hidden viewBox="0 0 20 18" className="size-5 fill-background stroke-foreground" strokeWidth={1.5}>
      {shape === 'rectangle' && <rect x="2" y="4" width="16" height="10" />}
      {shape === 'rounded' && <rect x="2" y="4" width="16" height="10" rx="3" />}
      {shape === 'ellipse' && <ellipse cx="10" cy="9" rx="8" ry="5.5" />}
      {shape === 'rhombus' && <path d="M10 2 18 9 10 16 2 9Z" />}
    </svg>
  )
}
